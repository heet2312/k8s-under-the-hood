# 01 — Core Workloads: Pods, Deployments, StatefulSets

> **Prerequisites:** [00 — Introduction](./00-introduction.md)

---

## 🧠 Theory: The Workload Hierarchy

```
You interact with:   Deployment / StatefulSet / DaemonSet
                              ↓ manages
                         ReplicaSet
                              ↓ manages
                            Pods
                              ↓ contains
                          Container(s)
```

You almost never create Pods directly. You create a **Deployment** or **StatefulSet**, which manages Pods for you.

### The Complete Kubernetes Object Map

This diagram shows every resource used in this project and how they connect:

![Kubernetes Architecture — All Objects](../assets/kubernetes-architecture.jpg)

**How to read this diagram:**

- **Top-left legend:** A reference card for every K8s object type. Use it as a cheat sheet — each shape/colour maps to a specific resource kind.
- **User → Internet → Ingress:** All external traffic enters through the Nginx Ingress Controller, which routes to the correct Service based on path or host.
- **Inside the Namespace (`my-app`):** This is where your application lives. Notice it's sandboxed — resources in other namespaces can't conflict with these names.
- **Service → Deployment → Pods:** The API (stateless) side. The Service has a stable ClusterIP. The Deployment manages 3 identical, interchangeable Pods.
- **Service → StatefulSet → Pods:** The Database (stateful) side. Each pod (`mydb-0`, `mydb-1`, `mydb-2`) has its own identity and its own PVC → PV chain.
- **Config & Secrets (top-right):** ConfigMap and Secret objects injected into pods as environment variables.
- **HPA (right side):** Watches the Deployment. Scales replicas based on CPU/memory.
- **PDB (right side):** Guards the Deployment during node drains.
- **Namespace (bottom-left):** A visual reminder that the Namespace itself is a K8s resource you must create first.

> **The key pattern:** Every connection is managed by a Kubernetes **controller** watching for state changes. Labels + selectors do the binding — nothing is wired up manually.

---

## Pod — The Atomic Unit

A Pod is the smallest deployable unit. It wraps **one or more containers** that:
- Share the same network interface (same IP, `localhost` is shared)
- Share the same storage volumes
- Are always scheduled on the same node

### Why Not Just Use Pods Directly?

```
You create a naked Pod: kubectl apply -f 01-pod.yaml
Pod crashes.
Kubernetes does NOT recreate it.
Your app is down.
```

Pods are ephemeral by design. Every time a Pod is created, it gets a new IP address. Nothing in a Pod is guaranteed to persist.

**Use a Deployment instead.** Deployments guarantee your desired replica count is always running.

### Pod Lifecycle States

| State | Meaning |
|-------|---------|
| `Pending` | Pod accepted, but containers not started yet (waiting for node, image pull) |
| `Running` | At least one container is running |
| `Succeeded` | All containers completed successfully (Jobs only) |
| `Failed` | All containers exited, at least one with failure |
| `CrashLoopBackOff` | Container keeps crashing; K8s is backing off retries exponentially |
| `OOMKilled` | Container exceeded its memory limit and was killed |
| `ImagePullBackOff` | Cannot pull the container image (wrong tag, auth failure) |

### Raw YAML ([k8s-scripts/01-pod.yaml](../k8s-scripts/01-pod.yaml))

```yaml
# 01-pod.yaml — for learning only; use a Deployment in production
apiVersion: v1
kind: Pod
metadata:
  name: taskflow-api-pod
  namespace: taskflow
  labels:
    app: api                    # Services use this label to find and route to this pod
spec:
  containers:
    - name: api
      image: ghcr.io/senghaniheet/taskflow-api:latest
      imagePullPolicy: Never    # Use the locally loaded Minikube image

      ports:
        - containerPort: 5000   # Documentation only — does not open the port

      env:
        - name: NODE_ENV
          value: "production"
        - name: JWT_SECRET
          value: "replace-me"   # Never hardcode real secrets — use a Secret resource

      resources:
        requests:
          cpu: 200m             # 200 millicores = 0.2 of one CPU core
          memory: 128Mi
        limits:
          cpu: 1000m            # Container is throttled if exceeded
          memory: 512Mi         # Container is OOMKilled if it exceeds this

      readinessProbe:
        httpGet:
          path: /api/health
          port: 5000
        initialDelaySeconds: 5
        periodSeconds: 10

      livenessProbe:
        httpGet:
          path: /api/health
          port: 5000
        initialDelaySeconds: 15
        periodSeconds: 15
        failureThreshold: 5     # Container is restarted after 5 consecutive failures
```

### → Try It: Apply and Observe a Pod

```bash
# Make sure the taskflow namespace exists first
kubectl apply -f k8s-scripts/00-namespace.yaml

# Create the pod
kubectl apply -f k8s-scripts/01-pod.yaml

# Watch it start up
kubectl get pod taskflow-api-pod -n taskflow -w
# Should go: Pending → Running

# Inspect it
kubectl describe pod taskflow-api-pod -n taskflow
# Read the Events section at the bottom — shows every step K8s took

# Check the probe results
kubectl describe pod taskflow-api-pod -n taskflow | grep -A 5 "Readiness\|Liveness"

# See the logs
kubectl logs taskflow-api-pod -n taskflow

# Now simulate a crash — delete the pod
kubectl delete pod taskflow-api-pod -n taskflow

# Try to get it again
kubectl get pod taskflow-api-pod -n taskflow
# Error: pod "taskflow-api-pod" not found
# ↑ This is the problem. No one recreated it. Use a Deployment instead.
```

> **What you just proved:** A naked Pod is NOT self-healing. When it's deleted — by you, a crash, or a node failure — it stays dead. This is exactly why Deployments exist.

---

## Deployment — Managing Stateless Replicas

A Deployment manages a set of identical, interchangeable Pods (stateless). It wraps a **ReplicaSet** which actually manages the Pods.

**Why Deployment over a naked Pod?**
- ✅ **Self-healing:** if a Pod dies, the Deployment creates a new one
- ✅ **Scaling:** `replicas: 3` → `replicas: 10` instantly
- ✅ **Rolling updates:** update image with zero downtime
- ✅ **Rollback:** `kubectl rollout undo` if the new version is broken

### Rolling Update: Zero-Downtime Deploys

This project uses `maxUnavailable: 0` and `maxSurge: 1`:

```
Initial state (3 pods running, all old version):
  [api-abc] [api-def] [api-ghi]   ← old pods

Step 1: Create 1 new pod (4 pods total):
  [api-abc] [api-def] [api-ghi]   ← old
  [api-xyz]                        ← new (starting...)

Step 2: New pod passes readiness probe:
  [api-abc] [api-def] [api-ghi]   ← old (serving)
  [api-xyz]                        ← new (serving)

Step 3: Kill 1 old pod (back to 3):
  [api-def] [api-ghi]             ← old
  [api-xyz]                        ← new

  ... repeat until all replaced ...

Final state:
  [api-xyz] [api-uvw] [api-rst]   ← all new
```

**The readiness probe is the gatekeeper.** If the new pod fails the readiness probe, the rollout pauses — old pods keep serving. No downtime.

### Raw YAML ([k8s-scripts/02-deployment.yaml](../k8s-scripts/02-deployment.yaml))

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: taskflow-api
  namespace: taskflow
spec:
  replicas: 3

  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # Allow 1 extra pod during the update
      maxUnavailable: 0    # Never take down a pod before its replacement is ready

  selector:
    matchLabels:
      app: api

  template:
    metadata:
      labels:
        app: api
      annotations:
        # sha256 of ConfigMap/Secret content — changes here trigger a rolling restart
        checksum/config: "abc123..."
        checksum/secret: "def456..."

    spec:
      containers:
        - name: api
          image: ghcr.io/senghaniheet/taskflow-api:latest
          imagePullPolicy: Always   # Always pull so CI/CD new images are picked up

          envFrom:
            - configMapRef:
                name: taskflow-api-config   # loads NODE_ENV, PORT, LOG_LEVEL, etc.
            - secretRef:
                name: taskflow-api-secret   # loads JWT_SECRET, MONGO_URI

          resources:
            requests:
              cpu: 200m
              memory: 128Mi
            limits:
              cpu: 1000m
              memory: 512Mi

          readinessProbe:
            httpGet:
              path: /api/health
              port: 5000
            initialDelaySeconds: 5
            periodSeconds: 10

          livenessProbe:
            httpGet:
              path: /api/health
              port: 5000
            initialDelaySeconds: 15
            periodSeconds: 15
            failureThreshold: 5
```

### → Try It: Apply and Observe a Deployment

```bash
# Apply the ConfigMap and Secret first (Deployment needs them to start)
kubectl apply -f k8s-scripts/07-configmap.yaml
kubectl apply -f k8s-scripts/08-secret.yaml

# Create the Deployment
kubectl apply -f k8s-scripts/02-deployment.yaml

# Watch pods come up — notice random hash names (not taskflow-api-0, 1, 2)
kubectl get pods -n taskflow -w

# See the ReplicaSet that Deployment created automatically
kubectl get replicaset -n taskflow

# Prove self-healing: delete one pod
kubectl delete pod <paste-one-pod-name-here> -n taskflow
kubectl get pods -n taskflow
# A new pod is created immediately to replace it. Deployment maintains 3 replicas.

# Scale up manually
kubectl scale deployment taskflow-api -n taskflow --replicas=5
kubectl get pods -n taskflow  # Should now show 5 pods

# Scale back down
kubectl scale deployment taskflow-api -n taskflow --replicas=3

# Trigger a rolling update (simulates deploying a new image)
kubectl rollout restart deployment/taskflow-api -n taskflow
kubectl rollout status deployment/taskflow-api -n taskflow

# View rollout history
kubectl rollout history deployment/taskflow-api -n taskflow

# Roll back if needed
kubectl rollout undo deployment/taskflow-api -n taskflow
```

> **What you just proved:** Deployments self-heal, scale, and roll out — all without downtime. But notice the problem: all config is hardcoded in the YAML. To run this in staging with 1 replica, you'd need a second copy of the file. We'll solve this in [Chapter 05 — Helm](./05-helm.md).

### Rollback Commands

```bash
kubectl rollout history deployment/taskflow-api -n taskflow
kubectl rollout undo deployment/taskflow-api -n taskflow
kubectl rollout undo deployment/taskflow-api -n taskflow --to-revision=2
```

---

## Probes: The Traffic Gatekeeper

### Readiness Probe
Answers: **"Is this container ready to receive traffic?"**
- Until this passes, the Service will **NOT** route traffic to this pod
- If it fails after startup, the pod is temporarily removed from load balancing (not killed)

### Liveness Probe
Answers: **"Is this container still alive?"**
- If this fails `failureThreshold` times, the container is **killed and restarted**
- Catches deadlocks, infinite loops, hung processes

---

## StatefulSet — For Stateful Applications (MongoDB)

StatefulSets are for applications that need:
- **Stable identity:** Pod names don't change (`mongo-0`, `mongo-1`)
- **Ordered deployment:** Start in order (0, 1, 2), stop in reverse (2, 1, 0)
- **Stable storage:** Each pod gets its own PVC that persists across restarts

### Deployment vs StatefulSet

| Feature | Deployment (API, Web) | StatefulSet (MongoDB) |
|---------|----------------------|----------------------|
| Pod names | Random hash (`api-abc123`) | Ordered (`mongo-0`) |
| Pod DNS | Unstable IP | `mongo-0.mongo.taskflow.svc` |
| Start order | Simultaneous | Sequential |
| Storage | Shared or none | Unique PVC per pod |
| Use case | Stateless (HTTP servers) | Stateful (databases, queues) |

### Raw YAML ([k8s-scripts/03-statefulset.yaml](../k8s-scripts/03-statefulset.yaml))

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: taskflow-mongo
  namespace: taskflow
spec:
  serviceName: taskflow-mongo  # Required: links to the headless Service for stable DNS
  replicas: 1

  selector:
    matchLabels:
      app: mongo

  template:
    metadata:
      labels:
        app: mongo
    spec:
      containers:
        - name: mongo
          image: mongo:7

          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi

          volumeMounts:
            - name: mongo-storage
              mountPath: /data/db   # MongoDB stores all data here; must persist across restarts

      volumes:
        - name: mongo-storage
          persistentVolumeClaim:
            claimName: taskflow-mongo-pvc
```

### → Try It: Apply and Observe a StatefulSet

```bash
# Apply the PVC first (StatefulSet needs storage)
kubectl apply -f k8s-scripts/09-pvc.yaml

# Create the StatefulSet
kubectl apply -f k8s-scripts/03-statefulset.yaml

# Notice: pods have ORDINAL names, not random hashes
kubectl get pods -n taskflow | grep mongo
# Output: taskflow-mongo-0   ← always this exact name

# See the StatefulSet status
kubectl get statefulset -n taskflow

# Delete the pod — watch it restart with the SAME name
kubectl delete pod taskflow-mongo-0 -n taskflow
kubectl get pods -n taskflow -w
# mongo-0 reappears with the same name, same PVC, same data

# Try to scale (creates mongo-0, mongo-1 in order)
kubectl scale statefulset taskflow-mongo -n taskflow --replicas=2
kubectl get pods -n taskflow -w
# mongo-1 starts ONLY after mongo-0 is Running and Ready

# Scale back down (deletes mongo-1 first, in reverse order)
kubectl scale statefulset taskflow-mongo -n taskflow --replicas=1
```

> **What you just proved:** StatefulSets give each pod a stable name and dedicated storage. The ordered, predictable naming is what makes databases like MongoDB work reliably in Kubernetes.

---

## 🛠️ Hands-On Challenge

**Goal:** Observe rolling updates and StatefulSet behaviour live.

```bash
# ── Part 1: Watch a Rolling Update ─────────────────────────

# Terminal 1: Watch pods continuously
kubectl get pods -n taskflow -w

# Terminal 2: Trigger a rolling restart (simulates a new image deploy)
kubectl rollout restart deployment/taskflow-api -n taskflow

# In Terminal 1 you should see:
# - New pods created (Pending → Running)
# - Old pods terminated one by one
# - Never more than 1 extra pod at a time (maxSurge: 1)
# - Never 0 available pods (maxUnavailable: 0)

# ── Part 2: Explore Probe Behaviour ─────────────────────────

# See probe configuration for the API
kubectl describe pod <api-pod-name> -n taskflow
# Look for: Liveness, Readiness sections — note delays and thresholds

# ── Part 3: Reflect on the Hardcoded Problem ─────────────────

# How many YAML files did you just need to apply manually?
# 00-namespace.yaml
# 07-configmap.yaml
# 08-secret.yaml
# 09-pvc.yaml
# 02-deployment.yaml
# 03-statefulset.yaml
# ...and we haven't done services or ingress yet.
# This is the problem Helm solves. We'll get there in Chapter 05.
```

**What to notice:**
- During rolling update: old pods serve traffic while new ones start
- StatefulSet pods always have ordinal names (mongo-0)
- After killing mongo-0, it restarts with the same name and all data intact

---

**Next:** [02 — Networking: Services, Ingress, and DNS →](./02-networking.md)