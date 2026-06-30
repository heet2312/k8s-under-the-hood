# 07 — Reliability: HPA, PDB, Resource Limits, and Probes

> **Prerequisites:** [06 — CI/CD](./06-cicd.md)

---

## 🧠 Theory: Building for Production Reliability

A production service must survive:
- **Traffic spikes** — scale out automatically, scale back in to save cost
- **Node maintenance** — drain nodes without dropping requests
- **Memory leaks** — kill and restart leaky containers before they crash the node
- **Slow starts** — don't route traffic to a container still warming up

| Problem | Solution |
|---------|---------|
| Traffic spikes | Horizontal Pod Autoscaler (HPA) |
| Node drains | Pod Disruption Budget (PDB) |
| Memory leaks | Resource Limits + OOMKill |
| Slow starts / unhealthy pods | Readiness & Liveness Probes |

---

## Resource Requests & Limits

Every container should declare its resource needs.

### Requests — For the Scheduler

The **Scheduler** uses `requests` to decide which node can fit the pod:

```
Node has 2 CPU cores, 4Gi memory
Node already running pods consuming: 1.5 CPU, 3Gi memory
New pod requests: 200m CPU, 128Mi memory

→ Node has enough room: 0.5 CPU, 1Gi remaining
→ Scheduler places pod on this node ✅
```

### Limits — For the Kernel

`limits` are enforced by the Linux kernel's cgroups:

- **CPU limit:** Container gets throttled (slowed down), NOT killed.
- **Memory limit:** If the container tries to allocate more than its limit, the kernel kills it: **OOMKilled**.

```
Memory limit: 512Mi
Container allocates 513Mi
→ Kernel sends SIGKILL (signal 9)
→ Pod restarts
→ kubectl describe pod shows: OOMKilled (exit code 137)
```

### CPU Units Reference

| Value | Meaning |
|-------|---------|
| `1000m` | 1 CPU core |
| `500m` | 0.5 CPU cores |
| `200m` | 0.2 CPU cores |
| `1` | 1 CPU core (same as 1000m) |

---

## HPA — Horizontal Pod Autoscaler

HPA automatically adjusts the number of pod replicas based on CPU and/or memory usage.

### The Scaling Loop

```
Every 15 seconds:
  1. metrics-server aggregates CPU/memory from all API pods
  2. HPA controller reads: "avg CPU = 85%, target = 60%"
  3. Desired replicas = ceil(current × (current/target))
                      = ceil(3 × (85/60))
                      = ceil(4.25) = 5
  4. HPA patches: deployment.spec.replicas = 5
  5. New pods start, CPU load distributes across 5 pods
  6. Next cycle: avg CPU drops to ~51% → within target range
```

### Cooldown Periods (prevents flapping)

| Event | Default Wait |
|-------|-------------|
| After scale-up | 3 minutes before another scale-up |
| After scale-down | 5 minutes before scale-down |

### Why minReplicas: 3?

Even at zero traffic, this project runs 3 API replicas because:
1. **High availability:** If one pod dies, 2 are still serving
2. **PDB compatibility:** PDB allows `maxUnavailable: 1`, so 3 gives a safe floor
3. **Cold start avoidance:** Requests don't wait for pods to warm up when traffic resumes

### Raw YAML ([k8s-scripts/10-hpa.yaml](../k8s-scripts/10-hpa.yaml))

```yaml
# Requires metrics-server addon: minikube addons enable metrics-server
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: taskflow-api-hpa
  namespace: taskflow
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: taskflow-api          # Must match the Deployment name exactly

  minReplicas: 3               # Floor — never scale below this
  maxReplicas: 10              # Ceiling — never scale above this

  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          # Formula: desiredReplicas = ceil(currentReplicas × (currentCPU% / 60))
          averageUtilization: 60

    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### → Try It: Apply HPA and Watch It Scale

```bash
# Enable metrics-server (required for HPA to work)
minikube addons enable metrics-server

# Wait for metrics-server to be ready
kubectl get pods -n kube-system | grep metrics-server

# Apply the HPA
kubectl apply -f k8s-scripts/10-hpa.yaml

# Check HPA status
kubectl get hpa -n taskflow
# TARGETS: <unknown>/60%   ← wait ~30 seconds for first metrics scrape
# After a minute: 5%/60%  ← low traffic, 3 replicas

# Terminal 1: Watch HPA continuously
kubectl get hpa -n taskflow -w

# Terminal 2: Generate load
kubectl run load-test \
  --image=busybox \
  --restart=Never \
  -n taskflow \
  --command -- sh -c "while true; do wget -q -O- http://api:5000/api/health; done"

# Back in Terminal 1 — watch TARGETS tick up and REPLICAS increase
# When CPU > 60%, HPA scales up. Stop the load:
kubectl delete pod load-test -n taskflow

# Watch scale-down — takes ~5 minutes (conservative to prevent flapping)
kubectl get hpa -n taskflow -w
```

> **What you just proved:** HPA automatically maintains your target CPU utilisation. Scale-up is fast (seconds); scale-down is deliberately slow (minutes) to prevent thrashing.

---

## PDB — Pod Disruption Budget

A PDB limits how many pods can be taken down **voluntarily** at the same time.

### Voluntary vs Involuntary Disruptions

| Type | Example | PDB Applies? |
|------|---------|-------------|
| Voluntary | `kubectl drain` (node maintenance), cluster autoscaler | ✅ Yes |
| Involuntary | Node hardware failure, pod OOMKilled, crash | ❌ No |

### The PDB Protection Scenario

```
3 API replicas, maxUnavailable: 1

Admin wants to drain node-1 (for OS upgrade):
kubectl drain node-1 --ignore-daemonsets

Node-1 has 2 API pods.

Step 1: K8s checks PDB → can only evict 1 pod
Step 2: Evicts api-pod-1 → 2 remaining pods, workload continues
Step 3: New pod scheduled on another node → 3 pods again
Step 4: PDB allows evicting api-pod-2 (the second pod on node-1)

Without PDB: Both pods evicted simultaneously → potential downtime
With PDB:    One at a time → always at least 2 pods serving
```

### Raw YAML ([k8s-scripts/11-pdb.yaml](../k8s-scripts/11-pdb.yaml))

```yaml
# Applies during voluntary disruptions only (node drain, upgrades).
# Does NOT protect against hardware failures or OOMKilled crashes.
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: taskflow-api-pdb
  namespace: taskflow
spec:
  # With 3 replicas: at most 1 pod can be taken down at a time during maintenance
  maxUnavailable: 1

  selector:
    matchLabels:
      app: api
```

### → Try It: Apply PDB and Simulate a Drain

```bash
# Apply the PDB
kubectl apply -f k8s-scripts/11-pdb.yaml

# Inspect it
kubectl get pdb -n taskflow
# Shows: MIN AVAILABLE, MAX UNAVAILABLE, ALLOWED DISRUPTIONS

kubectl describe pdb taskflow-api-pdb -n taskflow
# Look for: Disruptions Allowed (should be 1 with 3 replicas)

# Simulate a node drain (Minikube has 1 node, so this is educational)
kubectl cordon minikube                 # Mark node as unschedulable
kubectl drain minikube \
  --ignore-daemonsets \
  --delete-emptydir-data \
  --force
# Watch: pods evicted one at a time because of PDB

kubectl uncordon minikube              # Restore scheduling
```

> **What you just proved:** PDB enforces eviction ordering. Without it, all pods on a node could be evicted simultaneously during maintenance, causing downtime.

---

## Rolling Update + PDB + HPA Together

These three work together to give you zero-downtime deploys AND safe maintenance:

```
Normal operation (3 replicas):
  [api-1] [api-2] [api-3]      All serving traffic

Rolling update begins:
  HPA: 3 desired (no load)
  PDB: maxUnavailable=1 → can only kill 1 pod at a time
  Strategy: maxSurge=1 → can create 1 extra pod

  [api-1] [api-2] [api-3] [api-NEW]   4 pods briefly
  [api-2] [api-3] [api-NEW]           3 pods (api-1 deleted)
  ...
  [api-NEW] [api-NEW2] [api-NEW3]      3 pods ✅ Done
```

At no point were 0 pods serving. Gradual cutover from old to new version.

---

## 🛠️ Hands-On Challenge

**Goal:** Watch HPA scale up, observe PDB protection, and inspect resource limits.

```bash
# ── Part 1: Resource Inspection ─────────────────────────────

kubectl top pods -n taskflow
kubectl top nodes

kubectl describe pod <api-pod-name> -n taskflow | grep -A 10 "Limits\|Requests"
# See the actual CPU/memory ceiling for each container

# ── Part 2: Full Stack Applied with Raw YAML ──────────────────

# At this point you've applied:
# kubectl apply -f k8s-scripts/00-namespace.yaml
# kubectl apply -f k8s-scripts/07-configmap.yaml
# kubectl apply -f k8s-scripts/08-secret.yaml
# kubectl apply -f k8s-scripts/09-pvc.yaml
# kubectl apply -f k8s-scripts/02-deployment.yaml
# kubectl apply -f k8s-scripts/03-statefulset.yaml
# kubectl apply -f k8s-scripts/04-service-clusterip.yaml
# kubectl apply -f k8s-scripts/06-ingress.yaml
# kubectl apply -f k8s-scripts/10-hpa.yaml
# kubectl apply -f k8s-scripts/11-pdb.yaml
# That's 10 separate files, applied in a specific dependency order.
# What if you forget one? What if order changes? What about staging?
# Chapter 05 — Helm — solved all of this.

# ── Part 3: Full HPA Scale Test ──────────────────────────────

kubectl get hpa -n taskflow -w &   # background watch

kubectl run load-test \
  --image=busybox --restart=Never -n taskflow \
  --command -- sh -c "while true; do wget -q -O- http://api:5000/api/health; done"

# Watch replicas increase as CPU climbs above 60%
# Kill load and watch slow scale-down
kubectl delete pod load-test -n taskflow
```

**What to notice:**
- HPA reacts within ~30-60 seconds (metrics scrape + HPA evaluation cycle)
- Scale-down is much slower than scale-up (conservative, prevents flapping)
- `kubectl drain` respects PDB — pods are evicted in controlled batches

> **Bridge:** You have just watched HPA scale as raw kubectl numbers. In the next chapter you will understand the full observability stack and get Grafana running — so you can watch the exact same scaling event as a live, visual dashboard.

---

**Next:** [08 — Observability Architecture →](./08-observability-arch.md)