# 03 — Configuration: ConfigMaps and Secrets

> **Prerequisites:** [02 — Networking](./02-networking.md)

---

## 🧠 Theory: The 12-Factor App Principle

One of the [12-Factor App](https://12factor.net/config) principles states:
> **Store config in the environment** — not in the code.

Why? Your code should be the same binary in dev, staging, and production. Only the config changes:
- Dev: `MONGO_URI=mongodb://localhost:27017/taskflow-dev`
- Production: `MONGO_URI=mongodb://mongo:27017/taskflow`

Kubernetes provides two resources for this: **ConfigMap** (non-sensitive) and **Secret** (sensitive).

---

## ConfigMap — Non-Sensitive Configuration

A ConfigMap is a dictionary of key-value pairs for configuration that is **safe to version-control**.

### Three Ways to Use a ConfigMap

**Method 1: All keys as environment variables (what this project uses)**
```yaml
envFrom:
  - configMapRef:
      name: taskflow-api-config
# NODE_ENV, PORT, LOG_LEVEL all appear as process.env.* in Node.js
```

**Method 2: Specific key as a single environment variable**
```yaml
env:
  - name: MY_NODE_ENV
    valueFrom:
      configMapKeyRef:
        name: taskflow-api-config
        key: NODE_ENV
```

**Method 3: Mount as a file inside the container**
```yaml
volumeMounts:
  - name: config-vol
    mountPath: /app/config
volumes:
  - name: config-vol
    configMap:
      name: taskflow-api-config
# Creates /app/config/NODE_ENV, /app/config/PORT as files
```

### Raw YAML ([k8s-scripts/07-configmap.yaml](../k8s-scripts/07-configmap.yaml))

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: taskflow-api-config   # Referenced in Deployment's envFrom → configMapRef
  namespace: taskflow
data:
  NODE_ENV: "production"
  PORT: "5000"
  LOG_LEVEL: "http"           # Winston levels: http | info | warn | error
  JWT_EXPIRES_IN: "1d"
  ALLOWED_ORIGINS: "http://localhost:8080,http://taskflow.local"
  DISABLE_RATE_LIMIT: "false"

  # NODE_OPTIONS bootstraps the tracer before index.js loads (required for ESM)
  NODE_OPTIONS: "--import ./src/instrumentation.js"
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://tempo.monitoring.svc.cluster.local:4317"
  OTEL_SERVICE_NAME: "taskflow-api"
```

### → Try It: Apply and Inspect a ConfigMap

```bash
# Apply the ConfigMap
kubectl apply -f k8s-scripts/07-configmap.yaml

# View the ConfigMap data
kubectl get configmap taskflow-api-config -n taskflow
kubectl describe configmap taskflow-api-config -n taskflow
# You can read every value — ConfigMaps are not encrypted

# Get raw YAML output
kubectl get configmap taskflow-api-config -n taskflow -o yaml

# Verify env vars are injected into a running pod
kubectl exec -it <api-pod-name> -n taskflow -- env | grep -E "NODE_ENV|LOG_LEVEL|OTEL"
# Should show the values from the ConfigMap

# Edit a value directly (don't do this in production — use helm upgrade or git)
kubectl edit configmap taskflow-api-config -n taskflow
# Change LOG_LEVEL from "http" to "debug"
# Note: existing pods do NOT pick this up automatically
# You must restart the Deployment for the change to take effect
kubectl rollout restart deployment/taskflow-api -n taskflow
```

> **The hardcoded problem:** Notice `LOG_LEVEL: "http"` is hardcoded. To run a staging environment with `LOG_LEVEL: "debug"`, you need a second copy of this file. In Chapter 05, Helm solves this with `{{ .Values.api.env.logLevel }}`.

---

## Secret — Sensitive Credentials

A Secret is identical to a ConfigMap in structure, but:
- Values are **base64-encoded** (not encrypted by default!)
- Access can be controlled by RBAC
- They are stored separately in etcd

### Base64 is Not Encryption

```bash
echo -n "my-jwt-secret" | base64
# → bXktand0LXNlY3JldA==

echo "bXktand0LXNlY3JldA==" | base64 -d
# → my-jwt-secret   ← Anyone can decode this!
```

**Base64 encodes — it does not encrypt.** Anyone with `kubectl get secret` access can read the value.

### Production-Grade Secret Management

| Approach | Tool | How It Works |
|----------|------|-------------|
| Basic | K8s Secrets | Base64 in etcd. Good for learning |
| Better | Sealed Secrets | Asymmetric encryption. Safe to commit to Git |
| Best | Vault / Cloud | HashiCorp Vault or AWS/GCP Secrets Manager. Injected at runtime |

### Raw YAML ([k8s-scripts/08-secret.yaml](../k8s-scripts/08-secret.yaml))

```yaml
# base64 is encoding, not encryption — anyone with kubectl access can decode these
# In production, use Sealed Secrets or a Vault integration instead
apiVersion: v1
kind: Secret
metadata:
  name: taskflow-api-secret   # Referenced in Deployment's envFrom → secretRef
  namespace: taskflow
type: Opaque                  # Generic key-value secret type

stringData:                   # Write plaintext here; K8s encodes it on save
  JWT_SECRET: "REPLACE_WITH_CRYPTOGRAPHICALLY_SECURE_RANDOM_STRING"
  MONGO_URI: "mongodb://mongo:27017/taskflow"
```

### → Try It: Apply and Inspect a Secret

```bash
# Apply the Secret
kubectl apply -f k8s-scripts/08-secret.yaml

# View the Secret — values appear base64 encoded
kubectl get secret taskflow-api-secret -n taskflow -o yaml
# data:
#   JWT_SECRET: UkVQTEFDRS4uLg==   ← base64 encoded

# Decode a value (PowerShell)
$encoded = kubectl get secret taskflow-api-secret -n taskflow -o jsonpath="{.data.JWT_SECRET}"
[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($encoded))
# → REPLACE_WITH_CRYPTOGRAPHICALLY_SECURE_RANDOM_STRING

# Verify env vars appear in plain text inside the pod
kubectl exec -it <api-pod-name> -n taskflow -- env | grep -E "JWT_SECRET|MONGO_URI"
# Secrets are decoded and injected as plain text environment variables

# Notice: env vars inside the container are plaintext
# The base64 encoding is only for storage in etcd, not for runtime security
```

> **What you just proved:** Secrets are base64 in the cluster but plaintext inside running containers. The encoding is about transport/storage format, not security. In production, lock down RBAC so only authorised service accounts can `get` secrets.

---

## The Checksum Trick: Force Restart on Config Change

Kubernetes does **not** automatically restart pods when a ConfigMap or Secret changes. New pods created after the change will get the new config. Existing pods won't.

The `02-deployment.yaml` has these annotations:

```yaml
annotations:
  checksum/config: "abc123..."   # sha256 of the ConfigMap content
  checksum/secret: "def456..."   # sha256 of the Secret content
```

When you change the ConfigMap → its sha256 changes → the annotation changes → Kubernetes detects a Pod template change → triggers a rolling update → all pods reload the new config.

In Chapter 05, Helm automates this checksum calculation automatically.

---

## 🛠️ Hands-On Challenge

**Goal:** Inspect, modify, and reload configuration without rebuilding the image.

```bash
# ── Part 1: Apply ConfigMap and Secret ──────────────────────

kubectl apply -f k8s-scripts/07-configmap.yaml
kubectl apply -f k8s-scripts/08-secret.yaml

# ── Part 2: Verify values inside the pod ─────────────────────

kubectl exec -it <api-pod-name> -n taskflow -- env | sort
# All keys from ConfigMap and Secret appear as plain env vars

# ── Part 3: Change LOG_LEVEL and manually restart ────────────

# Edit the ConfigMap (change LOG_LEVEL to "debug")
kubectl edit configmap taskflow-api-config -n taskflow

# Pods do NOT restart automatically — trigger it manually
kubectl rollout restart deployment/taskflow-api -n taskflow
kubectl rollout status deployment/taskflow-api -n taskflow

# Verify the new value in the new pod
kubectl exec -it <new-api-pod-name> -n taskflow -- env | grep LOG_LEVEL
# → LOG_LEVEL=debug

# ── Part 4: Count what you've applied so far ─────────────────
# kubectl apply -f k8s-scripts/00-namespace.yaml    ← chapter 01
# kubectl apply -f k8s-scripts/07-configmap.yaml    ← this chapter
# kubectl apply -f k8s-scripts/08-secret.yaml       ← this chapter
# kubectl apply -f k8s-scripts/09-pvc.yaml          ← chapter 01
# kubectl apply -f k8s-scripts/02-deployment.yaml   ← chapter 01
# kubectl apply -f k8s-scripts/03-statefulset.yaml  ← chapter 01
# kubectl apply -f k8s-scripts/04-service-clusterip.yaml ← chapter 02
# kubectl apply -f k8s-scripts/06-ingress.yaml      ← chapter 02
# That's 8 files. And we still have HPA and PDB to go.
# Chapter 05 replaces all of this with: helm install taskflow ./helm/taskflow
```

**What to notice:**
- ConfigMap values are readable by anyone with `kubectl get`
- Secret values are base64 but still decodable — not true encryption
- Changing a ConfigMap doesn't auto-restart pods (the checksum pattern solves this)

---

**Next:** [04 — Storage: PV, PVC, and StorageClass →](./04-storage.md)