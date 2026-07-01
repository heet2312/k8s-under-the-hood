# 02 — Namespaces: Virtual Clusters & Resource Governance

> **Prerequisites:** [01 — Setup & kubectl](./01-setup-kubectl.md)

---

## 🧠 Theory: What Is a Namespace?

A **Namespace** is a logical partition inside a Kubernetes cluster. Think of it like folders on a filesystem: resources in different namespaces are isolated from each other by name, but they can communicate if permitted.

```
Same physical cluster:
  taskflow      → the application (API, Web, MongoDB)
  monitoring    → observability stack (Prometheus, Grafana, Loki, Tempo)
  ingress-nginx → the Nginx Ingress Controller
  kube-system   → Kubernetes internal components (etcd, apiserver, scheduler)
```

**Why this matters:** Without namespaces, a `Service` named `api` in your app would conflict with a `Service` named `api` in your monitoring stack. Namespaces prevent these name collisions, making it possible to run dozens of unrelated applications on the same cluster.

---

## Creating a Namespace

**Raw YAML** ([k8s-scripts/namespace.yaml](../k8s-scripts/namespace.yaml)):
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: taskflow
  labels:
    # Labels enable filtering and are used by monitoring tools
    app.kubernetes.io/managed-by: helm
    environment: production
```

```bash
kubectl apply -f k8s-scripts/namespace.yaml
kubectl get namespaces                      # List all namespaces in the cluster
kubectl get all -n taskflow                 # View everything inside the namespace
```

---

## Advanced Namespace Strategies

Namespaces are more than just organization — they are the primary tool for **multi-tenancy**, **environment isolation**, and **resource governance** in enterprise clusters.

### Strategy 1: Environment-per-Namespace (Most Common)

Run staging and production in the **same cluster**, sharing expensive infrastructure (Ingress Controller, monitoring stack) while keeping application workloads isolated:

```
Same cluster:
  taskflow-prod     → 3 API replicas, 3 web replicas (live production traffic)
  taskflow-staging  → 1 API replica, 1 web replica (CI/CD deploys here first)
  monitoring        → shared Prometheus + Grafana (scrapes both namespaces)
  ingress-nginx     → shared Ingress Controller (routes by hostname)
```

With Helm, deploying to staging is a single command:
```bash
helm upgrade --install taskflow-staging ./helm/taskflow \
  --namespace taskflow-staging --create-namespace \
  --values helm/taskflow/values-staging.yaml
```

**Why this is better than separate clusters:** You get environment isolation without the cost and operational overhead of provisioning a second cluster. The Ingress Controller, Prometheus, and Loki are all shared — you only pay for the extra application pods.

### Strategy 2: Team-per-Namespace

In larger organizations, each team owns a namespace and is granted scoped RBAC (Role-Based Access Control). Developers can deploy to their team's namespace but cannot touch another team's resources:

```
  team-payments      → payments service, database, HPA
  team-auth          → auth service, session store
  team-notifications → email/SMS service, queue consumer
```

### Strategy 3: Blue-Green via Namespaces

For zero-downtime major version releases, you can run two full environments side-by-side in separate namespaces:

```
  taskflow-blue   → v1.0 (currently serving 100% of traffic)
  taskflow-green  → v2.0 (deploying and testing)
```

Once Green is verified, the Ingress rules are updated to route all traffic to Green. Blue is kept warm for instant rollback. See [16 — Deployment Strategies](./16-deployment-strategies.md) for the full implementation.

---

## Resource Quotas: Preventing Noisy Neighbours

Without limits, one misbehaving team or a runaway HPA can consume all cluster CPU/RAM, starving every other workload. A **ResourceQuota** enforces hard caps per namespace:

```yaml
# k8s-scripts/resource-quota.yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: taskflow-quota
  namespace: taskflow
spec:
  hard:
    # Pod count limits
    pods: "20"                    # Maximum 20 pods total in this namespace
    # Compute limits
    requests.cpu: "4"             # Total CPU requests across all pods ≤ 4 cores
    requests.memory: 8Gi          # Total memory requests ≤ 8 GiB
    limits.cpu: "8"               # Total CPU limits ≤ 8 cores
    limits.memory: 16Gi           # Total memory limits ≤ 16 GiB
    # Storage limits
    persistentvolumeclaims: "5"   # Max 5 PVCs
    requests.storage: 20Gi        # Total storage across all PVCs ≤ 20 GiB
```

```bash
kubectl apply -f k8s-scripts/resource-quota.yaml
kubectl describe resourcequota taskflow-quota -n taskflow
# Output shows: Used vs Hard limits — instantly see how much headroom remains
```

> [!NOTE]
> **LimitRange** is the companion to ResourceQuota. While ResourceQuota sets namespace-wide totals, a LimitRange sets **per-container** default limits — so any pod deployed without explicit `resources:` blocks automatically gets sensible defaults rather than running uncapped and risking OOMKill.

---

## Tooling: kubens — Switch Namespaces Instantly

Typing `-n taskflow` on every `kubectl` command gets tedious. The [`kubens`](https://github.com/ahmetb/kubectx) tool lets you set a default namespace for your current session:

```bash
# Install (via kubectx package which includes kubens)
# Windows (Chocolatey)
choco install kubectx

# macOS
brew install kubectx

# Usage
kubens                    # List all namespaces
kubens taskflow           # Switch default to taskflow
kubectl get pods          # Now targets taskflow without -n flag
kubens monitoring         # Switch to monitoring
kubectl get pods          # Targets monitoring namespace
kubens -                  # Switch back to the previous namespace
```

Paired with [`kubectx`](https://github.com/ahmetb/kubectx) (which switches between clusters), these two tools are standard in every Kubernetes engineer's toolkit.

---

## 🛠️ Hands-On Challenge

**Goal:** Explore namespaces and understand how isolation works in practice.

```bash
# ── Step 1: List all namespaces ────────────────────────────
kubectl get namespaces
# You should see: default, kube-system, kube-public
# ⏭️  taskflow is created in Chapter 03 when you deploy your first pod
#    monitoring and ingress-nginx appear in Chapter 11 (Observability)
#    Only seeing 3 namespaces here is expected.

# ── Step 2: Compare resources across namespaces ──────────────
kubectl get pods -n taskflow       # App workloads
kubectl get pods -n monitoring     # Observability stack
kubectl get pods -n kube-system    # Kubernetes internals

# ── Step 3: Prove name isolation works ───────────────────────
# Both taskflow and monitoring have a service — they don't conflict:
kubectl get svc -n taskflow
kubectl get svc -n monitoring
# Notice: a service named "api" in taskflow and "prometheus" in monitoring
# coexist without any conflict

# ── Step 4: Cross-namespace DNS ───────────────────────────
# ⏭️  Skipped here — the API pod doesn't exist yet.
#    Complete this step in Chapter 04 (Networking) after deploying the app:
#
#      kubectl exec -it <api-pod-name> -n taskflow -- sh
#      nslookup monitoring-grafana.monitoring.svc.cluster.local
#      # → resolves to Grafana's ClusterIP — cross-namespace communication works!
#      exit

# ── Step 5: Apply and inspect a ResourceQuota ────────────────
kubectl apply -f k8s-scripts/resource-quota.yaml
kubectl describe resourcequota taskflow-quota -n taskflow
# Look at the "Used" vs "Hard" columns — see how much your current deployment uses
```

**What to notice:**
- Resources in different namespaces have the same names without conflict (`api`, `web`, `mongo`)
- Cross-namespace DNS format: `<service>.<namespace>.svc.cluster.local`
- ResourceQuota `describe` shows real-time usage — a live budget tracker for your namespace

---

**Next:** [03 — Stateless Workloads: Pods & Deployments →](./03-stateless-workloads.md)
