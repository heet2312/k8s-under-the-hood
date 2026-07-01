# 01 — Setup & kubectl: Minikube and the CLI

> **Prerequisites:** [00 — Introduction: Docker → Kubernetes](./00-introduction.md)

---

## 🖥️ Minikube: Your Local K8s Cluster

Minikube runs a **single-node** Kubernetes cluster inside a VM or container on your laptop. It is the fastest way to get a real Kubernetes environment running locally.

### How It Differs from Production

| Aspect | Minikube | Production (GKE/EKS) |
|--------|----------|----------------------|
| Nodes | 1 | 3–100+ |
| Control Plane | Shared with worker | Managed, separate |
| Load Balancers | `minikube tunnel` or NodePort | Cloud LBs (ELB, GCLB) |
| Storage | hostPath on local disk | Managed disks (EBS, PD) |
| Image Registry | Load images locally | Container registries (GHCR, ECR) |

> [!NOTE]
> In Minikube, all four Control Plane components **and** your worker pods share the same single VM. This is fine for learning but means resource contention if you over-deploy. Always start with `--cpus=4 --memory=6144` for this project.

### Minikube Commands

```bash
minikube start --cpus=4 --memory=6144   # Start with enough resources
minikube status                          # Check if it's running
minikube ip                              # Get the cluster IP (for /etc/hosts)
minikube ssh                             # SSH into the Minikube VM
minikube addons enable ingress           # Enable Nginx Ingress Controller
minikube addons enable metrics-server    # Required for HPA
minikube image load <image>              # Load a local Docker image (skip registry)
minikube stop                            # Stop without destroying
minikube delete                          # Destroy the cluster
```

---

## ⌨️ kubectl: The Kubernetes CLI

`kubectl` is your command-line interface for talking to the Kubernetes API Server. Every operation — creating pods, checking logs, scaling deployments — goes through `kubectl` → API Server → etcd.

### Contexts & Namespaces

```bash
# Which cluster am I connected to?
kubectl config current-context

# Switch cluster
kubectl config use-context minikube

# Work in a specific namespace (so you don't have to type -n every time)
kubectl config set-context --current --namespace=taskflow
```

### The Core Commands

```bash
# ── Listing Resources ──────────────────────────────────────────
kubectl get pods -n taskflow
kubectl get pods -n taskflow -w              # -w = watch mode (live updates)
kubectl get pods -n taskflow -o wide         # Show node assignment + IP
kubectl get all -n taskflow                  # Pods, Services, Deployments...
kubectl get nodes                            # List all cluster nodes

# ── Inspecting Resources ───────────────────────────────────────
kubectl describe pod <pod-name> -n taskflow  # Events section shows WHY it's failing
kubectl describe node minikube               # Capacity, Allocatable, and Events
kubectl get events -n taskflow --sort-by=.lastTimestamp  # Recent cluster events

# ── Logs ──────────────────────────────────────────────────────
kubectl logs <pod-name> -n taskflow          # Last run's logs
kubectl logs <pod-name> -n taskflow -f       # Follow/tail live
kubectl logs <pod-name> -n taskflow --previous  # Logs from crashed previous container
kubectl logs -l app=api -n taskflow -f --max-log-requests=10  # All API pods at once

# ── Exec into a Container ─────────────────────────────────────
kubectl exec -it <pod-name> -n taskflow -- sh
kubectl exec -it <pod-name> -n taskflow -- env | grep MONGO  # Check env vars
kubectl exec -it <pod-name> -n taskflow -- nslookup api      # Test DNS

# ── Apply / Delete ────────────────────────────────────────────
kubectl apply -f my-file.yaml
kubectl delete -f my-file.yaml
kubectl delete pod <pod-name> -n taskflow    # Force restart a single pod

# ── Rollouts ──────────────────────────────────────────────────
kubectl rollout restart deployment/taskflow-api -n taskflow
kubectl rollout status deployment/taskflow-api -n taskflow
kubectl rollout history deployment/taskflow-api -n taskflow
kubectl rollout undo deployment/taskflow-api -n taskflow     # Roll back
```

### Debugging Workflow

When something breaks, follow this sequence:

```bash
# 1. Start with a high-level overview
kubectl get all -n taskflow
# Look for: STATUS != Running, READY != desired count, RESTARTS > 0

# 2. Describe the broken resource — the Events section is critical
kubectl describe pod <broken-pod-name> -n taskflow
# Common causes: ImagePullBackOff, OOMKilled, CrashLoopBackOff, Unschedulable

# 3. Check the logs — both current and previous container
kubectl logs <broken-pod-name> -n taskflow
kubectl logs <broken-pod-name> -n taskflow --previous

# 4. Exec in to verify env vars, DNS, and connectivity
kubectl exec -it <broken-pod-name> -n taskflow -- sh
env | grep MONGO_URI         # Is the connection string correct?
nslookup mongo               # Does DNS resolve?
wget -qO- http://api:5000/api/health  # Can this pod reach the API?
```

| Exit Code | Common Cause |
|-----------|-------------|
| `ImagePullBackOff` | Wrong image tag, missing registry auth, or private image |
| `CrashLoopBackOff` | App keeps crashing — check `kubectl logs --previous` |
| `OOMKilled` | Container exceeded its memory limit — raise `resources.limits.memory` |
| `Pending` | Node doesn't have enough CPU/RAM — scale the cluster |
| `Unschedulable` | No node matches the pod's scheduling constraints |

---

## 🛠️ Hands-On Challenge

**Goal:** Start Minikube, explore the cluster, and learn to use kubectl for debugging.

```bash
# ── Part 1: Start the Cluster ────────────────────────────────
minikube start --cpus=4 --memory=6144

# ── Part 2: Explore the Control Plane ───────────────────────
kubectl get nodes
# Notice: only 1 node (control plane + worker in Minikube)

kubectl get namespaces
kubectl get pods -n kube-system
# K8s internal components run as pods! See: etcd, apiserver, scheduler, controller-manager

kubectl get pods -n kube-system | grep -E "apiserver|etcd|scheduler|controller"
# These are the 4 control plane components you learned in Chapter 00

# ── Part 3: Observe a Running Pod (using kube-system) ───────
# ⏭️  The taskflow namespace doesn't exist yet — you'll deploy your first pod
#    in Chapter 03. For now, observe the K8s system pods that are always running:
kubectl get pods -n kube-system
# Pick any pod name from the output (e.g. etcd-minikube) and describe it:
kubectl describe pod etcd-minikube -n kube-system
# Look for these sections:
#   Node:        → which node (always minikube in local setup)
#   Status:      → Running
#   Containers:  → image, ports, resource limits
#   Conditions:  → PodScheduled, Initialized, Ready
#   Events:      → the history of what happened to this pod

# ── Part 4: kubectl exec ──────────────────────────────────────
# ⏭️  Skipped here — exec into your own app pods in Chapter 04 after deploying
#    the API and Services. You will then run:
#      kubectl exec -it <api-pod-name> -n taskflow -- sh
#      nslookup mongo        # proves Headless Service DNS
#      nslookup api          # proves ClusterIP DNS
#      env | grep NODE_ENV   # proves ConfigMap injection
```

**What to notice:**
- The control plane runs as ordinary pods in `kube-system` — Kubernetes dogfoods its own orchestration
- Every pod has its own cluster IP (ephemeral, changes on restart) — this is why Services exist
- The `Events` section in `describe` tells you exactly why a pod is failing
- `kubectl exec` turns any running container into an interactive debugging terminal

---

**Next:** [02 — Namespaces: Virtual Clusters & Resource Governance →](./02-namespaces.md)
