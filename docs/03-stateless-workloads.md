# 03 — Stateless Workloads: Pods & Deployments

> **Prerequisites:** [02 — Namespaces: Virtual Clusters & Resource Governance](./02-namespaces.md)

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

## 📦 Before You Apply Anything — Build & Push Your Image to GHCR

> [!IMPORTANT]
> Kubernetes **pulls images from a registry**. If you run `kubectl apply` before your image exists in GHCR, every pod will immediately enter `ImagePullBackOff`. Complete this section first — it only takes a few minutes.

### What is GHCR?

GitHub Container Registry (`ghcr.io`) is GitHub's built-in Docker registry. It lets you store and pull private or public container images alongside your code — no separate Docker Hub account needed.

### Step 1 — Create a Personal Access Token (PAT)

Docker login to GHCR requires a GitHub Personal Access Token, **not** your GitHub password.

1. Go to: `https://github.com/settings/tokens/new`
2. Fill in:
   - **Note:** `ghcr-push`
   - **Expiration:** 90 days
   - **Scopes:** tick `write:packages` and `read:packages`
3. Click **Generate token** — copy it immediately, GitHub shows it only once

```
ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    ↑ your token looks like this
```

### Step 2 — Log in to GHCR

```bash
# Replace YOUR_GITHUB_USERNAME and YOUR_PAT with your actual values
echo "YOUR_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Expected output:
# Login Succeeded
```

### Step 3 — Build and Push the API Image

```bash
# Build the API image from the server/ directory
# Replace senghaniheet with YOUR GitHub username
docker build -t ghcr.io/senghaniheet/taskflow-api:v1.0.0 ./server

# Push it to GHCR (this creates the package automatically)
docker push ghcr.io/senghaniheet/taskflow-api:v1.0.0

# Also tag it as latest for convenience
docker tag ghcr.io/senghaniheet/taskflow-api:v1.0.0 ghcr.io/senghaniheet/taskflow-api:latest
docker push ghcr.io/senghaniheet/taskflow-api:latest
```

### Step 4 — Build and Push the Web Image

```bash
# Build the Web (React) image from the client/ directory
docker build -t ghcr.io/senghaniheet/taskflow-web:v1.0.0 ./client

# Push it to GHCR
docker push ghcr.io/senghaniheet/taskflow-web:v1.0.0

docker tag ghcr.io/senghaniheet/taskflow-web:v1.0.0 ghcr.io/senghaniheet/taskflow-web:latest
docker push ghcr.io/senghaniheet/taskflow-web:latest
```

### Step 5 — Make the Package Visible (if private)

By default, new GHCR packages are private. Kubernetes needs a pull secret to access them.

**Option A — Make the package public (easiest for learning):**
1. Go to `https://github.com/YOUR_USERNAME?tab=packages`
2. Click `taskflow-api` → **Package settings** → **Change visibility → Public**
3. Repeat for `taskflow-web`

**Option B — Keep it private and create a Kubernetes pull secret:**
```bash
kubectl create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_PAT \
  --namespace=taskflow

# Then add this to your pod/deployment spec:
# imagePullSecrets:
#   - name: ghcr-pull-secret
```

> See [09 — CI/CD](./09-cicd.md) for the full guide on private packages and automating this with GitHub Actions.

### Verify your images are in GHCR

```bash
# Pull it back to confirm it's accessible
docker pull ghcr.io/senghaniheet/taskflow-api:v1.0.0
# Untagged: ghcr.io/senghaniheet/taskflow-api:v1.0.0
# ...
# Status: Image is up to date for ghcr.io/senghaniheet/taskflow-api:v1.0.0
```

Now your images exist in the registry. Kubernetes can pull them. Continue below. ✅

---

## Pod — The Atomic Unit

A Pod is the smallest deployable unit. It wraps **one or more containers** that:
- Share the same network interface (same IP, `localhost` is shared)
- Share the same storage volumes
- Are always scheduled on the same node

### Why Not Just Use Pods Directly?

```
You create a naked Pod: kubectl apply -f pod.yaml
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

### Raw YAML ([k8s-scripts/pod.yaml](../k8s-scripts/pod.yaml))



```yaml
# pod.yaml — for learning only; use a Deployment in production
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

### 🛠️ Try It: Apply and Observe a Pod

```bash
# Make sure the taskflow namespace exists first
kubectl apply -f k8s-scripts/namespace.yaml

# Create the pod
kubectl apply -f k8s-scripts/pod.yaml

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
# ⚠️ This is the problem. No one recreated it. Use a Deployment instead.
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

### Raw YAML ([k8s-scripts/deployment.yaml](../k8s-scripts/deployment.yaml))

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

### 🛠️ Try It: Apply and Observe a Deployment

```bash
# Apply the ConfigMap and Secret first (Deployment needs them to start)
kubectl apply -f k8s-scripts/configmap.yaml
kubectl apply -f k8s-scripts/secret.yaml

# Create the Deployment
kubectl apply -f k8s-scripts/deployment.yaml

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

> **What you just proved:** Deployments self-heal, scale, and roll out — all without downtime. But notice the problem: all config is hardcoded in the YAML. To run this in staging with 1 replica, you'd need a second copy of the file. We'll solve this in [Chapter 05 — Helm](./08-helm.md).

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

> [!NOTE]
> StatefulSets (for databases like MongoDB) are covered in [07 — StatefulSets](./07-statefulsets.md), after you've learned about Persistent Volumes in [06 — Storage](./06-storage.md).

---

**Next:** [04 — Networking: Services, Ingress, and DNS →](./04-networking.md)
