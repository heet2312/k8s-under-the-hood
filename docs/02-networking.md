# 02 — Networking: Services, Ingress, and DNS

> **Prerequisites:** [01 — Core Workloads](./01-core-workloads.md)

---

## 🧠 Theory: The Networking Problem

Pods get random IP addresses that change every time they restart. If the API pod dies and comes back, its IP changes. How does the React app know where to send requests?

**Answer: Services.** A Service gives your pods a stable IP and DNS name that never changes — even as the underlying pods come and go.

```
Without Services:          With Services:
API pod: 10.244.0.15  →   API Service: 10.96.10.1 (stable)
(crashes)                               ↓
API pod: 10.244.0.22  →   Still: 10.96.10.1 (same IP!)
```

---

## ClusterIP — Internal Service Discovery

**ClusterIP** is the default Service type. It creates a virtual IP that is only reachable **inside** the cluster.

```
React Pod → "api:5000" → DNS lookup → ClusterIP 10.96.10.1
                                      → kube-proxy routes to one of:
                                        [api-pod-1:5000]
                                        [api-pod-2:5000]
                                        [api-pod-3:5000]
```

The ClusterIP Service acts as a **load balancer** across all matching pods.

### Selector: How Services Find Pods

The Service uses a **label selector** to find which pods to route to:

```yaml
# The Service watches for pods with these labels:
selector:
  app: api

# The Deployment creates pods WITH these labels:
template:
  metadata:
    labels:
      app: api   # ← matches the Service selector
```

When a new pod starts with matching labels, the Service automatically starts routing to it.

### Kubernetes DNS: How `mongo:27017` Works

Every Service gets a DNS entry automatically:
```
Format:   <service-name>.<namespace>.svc.cluster.local
Example:  mongo.taskflow.svc.cluster.local

Short form (within same namespace):
  mongo   ← resolves to the same address
```

This is why `MONGO_URI` is `"mongodb://mongo:27017/taskflow"` — not an IP address. The name `mongo` resolves to the Service, and the Service routes to the pod.

### Headless Services (for StatefulSets)

A regular ClusterIP returns one virtual IP for all pods. A **Headless Service** (`clusterIP: None`) returns the actual IP of each individual pod:

```
Regular Service:   mongo.taskflow.svc → 10.96.5.1 (virtual, load balanced)
Headless Service:  mongo-0.mongo.taskflow.svc → 10.244.0.5 (specific pod!)
```

StatefulSets need headless services so each pod gets a stable, individually addressable DNS name.

### Raw YAML ([k8s-scripts/04-service-clusterip.yaml](../k8s-scripts/04-service-clusterip.yaml))

```yaml
# ── API Service ──────────────────────────────────────────────
apiVersion: v1
kind: Service
metadata:
  name: api                   # DNS inside the cluster: api.taskflow.svc.cluster.local
  namespace: taskflow
spec:
  type: ClusterIP             # Internal-only; not reachable from outside the cluster
  ports:
    - name: http
      port: 5000
      targetPort: 5000
  selector:
    app: api                  # Routes to all pods carrying this label

---
# ── MongoDB Headless Service ─────────────────────────────────
apiVersion: v1
kind: Service
metadata:
  name: mongo
  namespace: taskflow
spec:
  clusterIP: None             # Headless — individual pod DNS entries instead of a VIP
  ports:
    - port: 27017
      targetPort: 27017
  selector:
    app: mongo
```

### → Try It: Apply Services and Observe Routing

```bash
# Make sure the Deployment from chapter 01 is running first
kubectl get pods -n taskflow

# Apply both Services (the file contains two objects separated by ---)
kubectl apply -f k8s-scripts/04-service-clusterip.yaml

# See the Services
kubectl get svc -n taskflow
# api: ClusterIP with a stable 10.x.x.x IP
# mongo: ClusterIP with None (headless)

# See the Endpoints — actual pod IPs behind the Service
kubectl get endpoints api -n taskflow
# Lists the 3 pod IPs (these change; the Service IP doesn't)

kubectl describe svc api -n taskflow
# Look for: Selector, Endpoints, Type

# Prove DNS works — exec into the API pod
kubectl exec -it <api-pod-name> -n taskflow -- sh
nslookup api          # → 10.96.x.x (ClusterIP)
nslookup mongo        # → individual pod IPs (headless)
exit

# Delete one API pod — watch the Endpoints update automatically
kubectl delete pod <api-pod-name> -n taskflow
kubectl get endpoints api -n taskflow  # New pod IP appears as old one disappears
```

> **What you just proved:** The Service IP stays constant (`10.96.x.x`), but the Endpoints list (actual pod IPs) updates live as pods come and go. The Service is the stable abstraction layer.

---

## NodePort — Exposing Outside the Cluster

NodePort exposes the Service on a static port on **every node's external IP**:

```
External client → NodeIP:30500 → kube-proxy → Service → Pod
```

- Port range: 30000–32767
- Works in Minikube without extra setup
- **Not recommended for production HTTP** — use Ingress instead

```bash
minikube ip           # → 192.168.49.2
curl http://192.168.49.2:30500/api/health
```

### Raw YAML ([k8s-scripts/05-service-nodeport.yaml](../k8s-scripts/05-service-nodeport.yaml))

```yaml
# for development/testing only; use Ingress in production
apiVersion: v1
kind: Service
metadata:
  name: api-nodeport
  namespace: taskflow
spec:
  type: NodePort
  ports:
    - port: 5000
      targetPort: 5000
      nodePort: 30500     # Static port on every node (valid range: 30000–32767)
  selector:
    app: api
```

### → Try It: Access the API via NodePort

```bash
kubectl apply -f k8s-scripts/05-service-nodeport.yaml

# Get the Minikube node IP
minikube ip

# Hit the API directly without Ingress
curl http://$(minikube ip):30500/api/health
# Should return: {"status":"ok","..."}

kubectl get svc api-nodeport -n taskflow
# TYPE: NodePort, PORT(S): 5000:30500/TCP

# Clean up — we'll use Ingress for real traffic
kubectl delete -f k8s-scripts/05-service-nodeport.yaml
```

---

## Ingress — The Smart HTTP Router

An Ingress manages **HTTP/HTTPS routing** from outside the cluster to Services inside. Think of it as a programmatic Nginx config that Kubernetes manages for you.

```
Browser: http://taskflow.local/api/workspaces

  ↓ DNS: taskflow.local → 192.168.49.2 (Minikube IP)
  ↓ Nginx Ingress Controller (listening on port 80/443)
  ↓ Reads Ingress rules
  ↓ Path: /api → Service: api:5000
  ↓ ClusterIP routes to one of the 3 API pods
  ↓ Response returned to browser
```

An Ingress **object** (YAML) is just configuration. You also need an **Ingress Controller** — the actual running reverse proxy. This project uses Nginx:

```bash
minikube addons enable ingress
```

### Raw YAML ([k8s-scripts/06-ingress.yaml](../k8s-scripts/06-ingress.yaml))

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: taskflow-ingress
  namespace: taskflow
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "false"
    nginx.ingress.kubernetes.io/use-regex: "true"
spec:
  ingressClassName: nginx     # Selects the Nginx Ingress Controller

  rules:
    - host: "taskflow.local"
      http:
        paths:
          # More specific path must come first — evaluated top to bottom
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 5000

          - path: /
            pathType: Prefix  # Catch-all
            backend:
              service:
                name: web
                port:
                  number: 80
```

### → Try It: Apply Ingress and Test End-to-End Routing

```bash
# Enable the Nginx Ingress Controller addon (one-time setup)
minikube addons enable ingress

# Wait for the ingress controller pod to be ready
kubectl get pods -n ingress-nginx -w
# Wait until: ingress-nginx-controller-xxx  Running

# Apply the Ingress rules
kubectl apply -f k8s-scripts/06-ingress.yaml

# Add the hostname to your hosts file (run as Administrator on Windows)
# Open: C:\Windows\System32\drivers\etc\hosts
# Add this line:
#   192.168.49.2  taskflow.local    ← replace IP with: minikube ip

# Test the routing
curl http://taskflow.local/api/health
# → routes to the API service

curl http://taskflow.local/
# → routes to the web service

# Inspect the Ingress object
kubectl describe ingress taskflow-ingress -n taskflow
# Look for: Rules, Endpoints — shows which backend each path hits

kubectl get ingress -n taskflow
# Shows: ADDRESS (the Minikube IP), HOSTS, PORTS
```

> **What you just proved:** One Ingress object controls all external HTTP routing. The Ingress Controller (Nginx) reads it and routes accordingly — without you touching any Nginx config files directly.

---

## Traffic Flow: End-to-End

```
Browser (outside cluster)
    │
    │ HTTP request: taskflow.local/api/workspaces
    ▼
Minikube Node (192.168.49.2:80)
    │
    ▼
Nginx Ingress Controller
    │ Path /api → Service: api:5000
    ▼
Service: api (ClusterIP — load balances across 3 pods)
    ▼
One of: [taskflow-api-pod-1] or [taskflow-api-pod-2] or [taskflow-api-pod-3]
    │
    │ MongoDB query: mongodb://mongo:27017
    ▼
Service: mongo (Headless)
    ▼
StatefulSet Pod: taskflow-mongo-0
```

---

## 🛠️ Hands-On Challenge

**Goal:** Trace a complete request through every layer of the networking stack.

```bash
# ── Step 1: Apply everything in order ───────────────────────
kubectl apply -f k8s-scripts/00-namespace.yaml
kubectl apply -f k8s-scripts/07-configmap.yaml
kubectl apply -f k8s-scripts/08-secret.yaml
kubectl apply -f k8s-scripts/09-pvc.yaml
kubectl apply -f k8s-scripts/03-statefulset.yaml
kubectl apply -f k8s-scripts/02-deployment.yaml
kubectl apply -f k8s-scripts/04-service-clusterip.yaml
kubectl apply -f k8s-scripts/06-ingress.yaml

# Notice: 8 separate commands just to get to a working app.
# This is the exact problem we solve in Chapter 05 with Helm.

# ── Step 2: Inspect the full networking stack ────────────────
kubectl get all -n taskflow                   # Everything in one view
kubectl get endpoints -n taskflow             # Actual pod IPs behind each Service

# ── Step 3: Test internal DNS from inside the cluster ────────
kubectl exec -it <api-pod-name> -n taskflow -- sh
nslookup mongo                              # → mongo.taskflow.svc.cluster.local
nslookup api                               # → resolves to the Service ClusterIP
nslookup monitoring-grafana.monitoring     # → cross-namespace DNS works too!
exit

# ── Step 4: Watch load balancing in action ───────────────────
kubectl logs -l app=api -n taskflow -f --max-log-requests=10
# Make several requests — notice different pods handle them
```

**What to notice:**
- Services have `Endpoints` that update as pods start/stop
- DNS works across namespaces: `<service>.<namespace>`
- You needed 8 `kubectl apply` commands for a basic working stack
- Ingress routes `/api/*` to the API, everything else to the frontend

---

**Next:** [03 — Configuration: ConfigMaps and Secrets →](./03-configuration.md)