# 04 — Storage: PV, PVC, and StorageClass

> **Prerequisites:** [03 — Configuration](./03-configuration.md)

---

## 🧠 Theory: Why Containers Are Stateless by Default

When a container writes a file to its filesystem, that file lives in the container's **writable layer** — a temporary overlay on top of the image. When the container is deleted, the writable layer is destroyed with it.

```
Container starts         Container writes file     Container deleted
     ↓                          ↓                        ↓
Image: mongo:7         /data/db/collection.wt      ALL DATA GONE 💀
(read-only)            (in writable layer)
```

For a database like MongoDB, this is catastrophic. Every pod restart would wipe the database. Kubernetes solves this with **Persistent Volumes**.

---

## The Storage Trilogy

### 1. PersistentVolume (PV) — The Physical Disk

A PV is a **cluster-level** storage resource. It represents actual storage: a disk on a cloud provider, an NFS share, or a local directory.

PVs have a lifecycle **independent of any Pod**. Even if the pod is deleted, the PV (and its data) remains.

```yaml
# A PV is usually created automatically by a StorageClass
apiVersion: v1
kind: PersistentVolume
metadata:
  name: my-pv
spec:
  capacity:
    storage: 5Gi
  accessModes:
    - ReadWriteOnce
  hostPath:
    path: /mnt/data   # In Minikube: a directory on the VM's disk
```

### 2. PersistentVolumeClaim (PVC) — The Rental Request

A PVC is a pod's **request** for storage. Like renting an apartment:
- You specify how big (5Gi)
- You specify the access mode (ReadWriteOnce)
- Kubernetes finds a matching PV and "binds" it exclusively to your PVC

### 3. StorageClass — Dynamic Provisioning

In production, you don't create PVs manually. A **StorageClass** is a template that tells K8s *how to create a PV* when a PVC is requested.

```
PVC created with storageClassName: "ssd"
         ↓
StorageClass "ssd" provisions a 5Gi SSD disk on GCP
         ↓
PV automatically created and bound to the PVC
         ↓
Pod mounts the PVC
```

Minikube provides a default StorageClass called `standard` that creates `hostPath` volumes (directories on the VM disk).

---

## Access Modes

| Mode | Abbreviation | Meaning |
|------|-------------|---------|
| `ReadWriteOnce` | RWO | One node can mount for read/write |
| `ReadWriteMany` | RWX | Multiple nodes can mount simultaneously |
| `ReadOnlyMany` | ROX | Multiple nodes, read-only |

**Why MongoDB uses RWO:** MongoDB's WiredTiger storage engine uses file-level locking. Two MongoDB processes writing to the same `/data/db` directory simultaneously would corrupt the data. RWO ensures only one node writes at a time.

### Raw YAML ([k8s-scripts/09-pvc.yaml](../k8s-scripts/09-pvc.yaml))

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: taskflow-mongo-pvc    # Referenced by the StatefulSet's volumes section
  namespace: taskflow
spec:
  accessModes:
    - ReadWriteOnce           # One node can mount for read/write at a time (correct for MongoDB)

  resources:
    requests:
      storage: 5Gi

  # storageClassName omitted → uses cluster default
  # Minikube default: "standard" (hostPath on local disk)
  # Production (GKE, EKS): "ssd", "gp2", etc.
```

### → Try It: Apply a PVC and Watch It Bind

```bash
# Apply the PVC
kubectl apply -f k8s-scripts/09-pvc.yaml

# Check its status immediately
kubectl get pvc -n taskflow
# STATUS: Pending   ← waiting for a Pod to mount it (Minikube behavior)

# Apply the StatefulSet (this triggers the PV to be created and bound)
kubectl apply -f k8s-scripts/03-statefulset.yaml

# Check PVC status again
kubectl get pvc -n taskflow
# STATUS: Bound   ← a PV was automatically created and bound

# See the PV that was auto-created by Minikube's StorageClass
kubectl get pv
# Notice: RECLAIM POLICY = Delete (Minikube default — data gone when PVC deleted)
# Notice: STORAGECLASS = standard

# Inspect what Minikube created
kubectl describe pv <pv-name-from-above>
# Look for: Source.HostPath — the actual directory on the Minikube VM
```

> **What you just proved:** You created a PVC (a claim/request for storage). Kubernetes matched it with a PV (actual disk), created by Minikube's `standard` StorageClass automatically. The pod then mounted that PV as `/data/db`.

---

## PVC Binding: The Matching Rules

When a PVC is created, K8s searches for a PV that satisfies:
1. **Capacity:** PV storage ≥ PVC request
2. **Access mode:** PV supports the requested access mode
3. **StorageClass:** Same class (or default if not specified)

```
kubectl get pvc -n taskflow

NAME                      STATUS   VOLUME        CAPACITY   ACCESS MODES
taskflow-mongo-pvc        Bound    pvc-a1b2c3    5Gi        RWO
```

**Bound** = the PVC found a PV and data can be written. Any other status means the pod can't start.

---

## Data Survival: What Happens When MongoDB Pod Restarts

```
Normal operation:
  mongo-0 pod → mounts PVC → writes to /data/db → PV on node disk

Pod is deleted (crash, rolling update, etc.):
  mongo-0 deleted → PVC remains → PV remains (data intact)

K8s recreates the pod:
  mongo-0 recreated → claims same PVC (stable StatefulSet identity)
  → mounts same PV → /data/db has all previous data ✅
```

**What would destroy data:**
- `kubectl delete pvc taskflow-mongo-pvc -n taskflow` (manually delete the PVC)
- A StorageClass with `reclaimPolicy: Delete` (auto-deletes PV when PVC is deleted)

---

## PersistentVolumeReclaimPolicy

What happens to the PV when the PVC is deleted?

| Policy | Behaviour |
|--------|-----------|
| `Retain` | PV stays, data preserved. Admin must manually delete. |
| `Delete` | PV and its data are deleted automatically. |
| `Recycle` | (Deprecated) Wipes the data and makes PV available again. |

For a database, use `Retain` in production. Minikube's default is `Delete`.

---

## 🛠️ Hands-On Challenge

**Goal:** Prove that MongoDB data survives pod restarts.

```bash
# ── Part 1: Verify the PVC is Bound ─────────────────────────

kubectl get pvc -n taskflow
# STATUS should be: Bound

kubectl describe pvc taskflow-mongo-pvc -n taskflow
# Look for: Status: Bound, Volume, StorageClass, Access Modes

kubectl get pv
# RECLAIM POLICY = Delete (Minikube default)

# ── Part 2: Write Data to MongoDB ───────────────────────────

kubectl exec -it taskflow-mongo-0 -n taskflow -- mongosh

# Inside mongosh — create some test data
use testdb
db.test.insertOne({ message: "This data should survive a pod restart", timestamp: new Date() })
db.test.find()
exit

# ── Part 3: Delete the Pod and Watch It Restart ──────────────

kubectl delete pod taskflow-mongo-0 -n taskflow

# Watch it restart (same name, same PVC)
kubectl get pods -n taskflow -w
# mongo-0 will go: Terminating → Pending → Running

# ── Part 4: Verify Data Survived ────────────────────────────

kubectl exec -it taskflow-mongo-0 -n taskflow -- mongosh

use testdb
db.test.find()
# 🎉 Your document is still there!
exit

# ── Part 5: Inspect the Storage Path (Minikube only) ────────

minikube ssh
ls /tmp/hostpath-provisioner/  # ← Minikube stores PV data here
```

**What to notice:**
- PVC stays `Bound` even when the pod is deleted
- Pod restarts with the same name (StatefulSet guarantee)
- Data is intact — the new pod picked up the same PV

---

**Next:** [05 — Helm: The Package Manager for Kubernetes →](./05-helm.md)