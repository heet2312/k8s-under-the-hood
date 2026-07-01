# 16 — Deployment Strategies: Rolling Update, Blue-Green & Canary

> **Prerequisites:** [Previous Chapter](./15-tracing.md) | [09 — CI/CD](./09-cicd.md) | [10 — Reliability](./10-reliability.md)

---

## 🧠 Introduction: Why Deployment Strategy Matters

Every time you ship new code, you face the same hard question:

> *"How do I get the new version onto production without breaking anything for users who are already there?"*

Kubernetes gives you the primitives — Deployments, Services, Ingress, labels — to implement multiple answers to that question. Each strategy is a different risk/speed tradeoff:

| Strategy | Speed | Risk | Complexity | Rollback |
|---|---|---|---|---|
| **Rolling Update** | Medium | Low-Medium | Low | Automatic |
| **Blue-Green** | Instant | Low | Medium | Instant (flip selector) |
| **Canary** | Gradual | Very Low | High | Gradual scale-down |

This chapter walks through all three, showing you exactly how this project implements each one.

---

## Strategy 1 — Rolling Update

### Introduction

Rolling Update is Kubernetes default deployment strategy. It replaces old Pods with new ones **gradually**, one at a time (or in small batches), so the application is always partially available. There is no second environment — the same Deployment manages the entire transition.

```
BEFORE UPDATE          DURING UPDATE          AFTER UPDATE
-----------------      -------------------    -----------------
[api-abc] V1           [api-abc] V1 dying     [api-xyz] V2
[api-def] V1     ->    [api-def] V1           [api-uvw] V2
[api-ghi] V1           [api-ghi] V1           [api-rst] V2
                        [api-xyz] V2 new
```

The two critical knobs are `maxSurge` and `maxUnavailable`:

| Field | Meaning | This Project |
|---|---|---|
| `maxSurge` | Max extra pods above desired count | `1` — create 1 new pod at a time |
| `maxUnavailable` | Max pods that can be down | `0` — never remove an old pod until the new one is ready |

With `maxUnavailable: 0`, the **readiness probe is the gatekeeper**. A new pod must pass its readiness check before any old pod is killed. If the new pod never becomes ready, the rollout pauses automatically and old pods keep serving traffic.

![Rolling Update Architecture](../assets/Rolling_Update.png)

*The diagram shows both the V1 ReplicaSet (slowly scaling down) and the new V2 ReplicaSet (spinning up) co-existing during the transition. The smart load balancer routes traffic to whichever pods pass the readiness probe.*

### How to Implement

This project configures rolling updates on every Deployment in `helm/taskflow/templates/`:

```yaml
# helm/taskflow/templates/api-deployment.yaml (simplified)
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1        # One extra pod during update
      maxUnavailable: 0  # Zero downtime — old pods stay until new ones are Ready
```

The readiness probe that guards the rollout:

```yaml
readinessProbe:
  httpGet:
    path: /api/health
    port: 5000
  initialDelaySeconds: 5   # Do not check until 5s after container starts
  periodSeconds: 10         # Check every 10s
  successThreshold: 1       # One pass = Ready
  failureThreshold: 5       # Five failures = NotReady (pause rollout)
```

**Checksum annotations — automatic restarts on config changes:**

```yaml
# helm/canary/templates/api-deployment.yaml
metadata:
  annotations:
    checksum/config: "{{ "{{" }} include (print $.Template.BasePath "/api-configmap.yaml") $ | sha256sum {{ "}}" }}"
    checksum/secret: "{{ "{{" }} include (print $.Template.BasePath "/api-secret.yaml") $ | sha256sum {{ "}}" }}"
```

> When a ConfigMap or Secret changes, Helm recalculates the sha256sum. The Pod template annotation changes, which triggers a rolling restart automatically — no manual `kubectl rollout restart` needed.

**Triggering a rolling update via Helm:**

```bash
# Update the image tag and upgrade
helm upgrade taskflow ./helm/taskflow \
  --namespace taskflow \
  --set api.image.tag="v2.0.0"

# Or trigger a restart without changing the image
kubectl rollout restart deployment/taskflow-api -n taskflow
```

### Try It: Observe a Rolling Update

```bash
# Terminal 1: Watch pods continuously
kubectl get pods -n taskflow -w

# Terminal 2: Trigger a rolling restart (simulates a new image deploy)
kubectl rollout restart deployment/taskflow-api -n taskflow

# What to observe in Terminal 1:
# New pod: Pending -> ContainerCreating -> Running (but not yet Ready)
# Old pod: stays Running and serving traffic
# New pod: passes readiness probe -> becomes Ready
# Old pod: Terminating
# Repeat for each replica

# Check rollout status with a progress bar
kubectl rollout status deployment/taskflow-api -n taskflow

# View rollout history
kubectl rollout history deployment/taskflow-api -n taskflow

# Roll back if the new version is broken
kubectl rollout undo deployment/taskflow-api -n taskflow

# Roll back to a specific revision
kubectl rollout undo deployment/taskflow-api -n taskflow --to-revision=2
```

> **What you just proved:** Kubernetes replaces pods one at a time, gated by the readiness probe. If the new pod never becomes healthy, the rollout automatically pauses — old pods keep serving. No downtime, no manual intervention.

### Advantages and Disadvantages

| Advantages | Disadvantages |
|---|---|
| Zero configuration overhead — default behaviour | Both versions run simultaneously during rollout |
| Gradual rollout catches crashes before full deployment | No instant cutover; takes time to complete |
| Automatic rollback via `kubectl rollout undo` | Cannot do A/B testing (no traffic splitting) |
| Resource-efficient — no duplicate environment needed | Hard to isolate issues — users may see either version |
| Works out of the box with every Kubernetes cluster | Misconfigured readiness probe can stall rollout permanently |

**When to use Rolling Update:**
- Everyday feature releases and bug fixes
- When both old and new versions can run side-by-side safely
- When you want the simplest, lowest-overhead approach
- Avoid when versions are incompatible (e.g., breaking DB schema changes)

---

## Strategy 2 — Blue-Green Deployment

### Introduction

Blue-Green deployment maintains **two complete, identical environments** — Blue (currently live, V1) and Green (new version, V2). At any point in time, the Service selector points to exactly **one** environment. When you are ready to go live, you flip the selector. Traffic switches instantly — zero downtime, zero gradual rollout.

- **Blue** = current production (V1, 100% traffic)
- **Green** = new version (V2, staged and tested, zero traffic)

```
                +--------------------------+
                |  Service (web/api)       |
                |  selector: color=blue    |  <- flip to "green" to cut over
                +------------+------------+
                             | 100% traffic
            +----------------v-----------------+
            |  Blue Deployment (V1)            | <- LIVE
            |  color=blue, 5 replicas          |
            +----------------------------------+
            +----------------------------------+
            |  Green Deployment (V2)           | <- STAGED (no traffic)
            |  color=green, 5 replicas         |
            +----------------------------------+
```

![Blue-Green Architecture](../assets/Blue-Green.png)

*Both ReplicaSets run simultaneously. The Traffic Router (Service selector) sends 100% to Blue (V1). The toggle on the right represents the `productionTarget` value — flip it from `blue` to `green` to cut over instantly. The colour-based traffic configuration panel shows the active and target rules.*

### How to Implement

This project implements Blue-Green in `helm/blue-green/`. The critical pattern is the **`productionTarget`** value that controls the Service selector.

**Service — the traffic switch** ([helm/blue-green/templates/web-service.yaml](../helm/blue-green/templates/web-service.yaml)):

```yaml
# The selector below is the ONLY thing that determines which deployment serves traffic.
# Change .Values.web.productionTarget from "blue" to "green" to cut over.
spec:
  selector:
    app: web
    color: blue   # <- set to "blue" or "green" via .Values.web.productionTarget
```

**Deployment — one per colour** ([helm/blue-green/templates/web-deployment.yaml](../helm/blue-green/templates/web-deployment.yaml)):

```yaml
# Helm loops over the deployments map and creates one Deployment per colour
# range $color, $config := .Values.web.deployments
apiVersion: apps/v1
kind: Deployment
metadata:
  name: taskflow-web-blue        # or taskflow-web-green
  labels:
    color: blue                  # "blue" or "green"
spec:
  selector:
    matchLabels:
      color: blue
  template:
    metadata:
      labels:
        color: blue
    spec:
      containers:
        - name: web
          image: "ghcr.io/senghaniheet/taskflow-web:v1.0.0"
```

**Values file — controlling the switch:**

```yaml
# helm/blue-green/values.yaml
web:
  productionTarget: blue     # <- Change this to "green" to cut over

  deployments:
    blue:
      enabled: true
      image:
        repository: ghcr.io/senghaniheet/taskflow-web
        tag: "v1.0.0"        # Current stable version

    green:
      enabled: true
      image:
        repository: ghcr.io/senghaniheet/taskflow-web
        tag: "v2.0.0"        # New version — staged and tested, no traffic yet
```

**Performing the cutover:**

```bash
# 1. Deploy both blue and green (green gets no traffic yet)
helm upgrade --install taskflow ./helm/blue-green --namespace taskflow

# 2. Test the green environment directly (port-forward to it)
kubectl port-forward deployment/taskflow-web-green 8080:80 -n taskflow
# Open http://localhost:8080 and smoke-test the new version

# 3. Instant cutover — flip the switch
helm upgrade taskflow ./helm/blue-green \
  --namespace taskflow \
  --set web.productionTarget=green
# Service selector updates instantly — 100% of traffic now goes to Green (V2)

# 4. Rollback is equally instant
helm upgrade taskflow ./helm/blue-green \
  --namespace taskflow \
  --set web.productionTarget=blue
```

### Try It: Observe Blue-Green in Action

```bash
# Deploy both environments
helm upgrade --install taskflow ./helm/blue-green -n taskflow --create-namespace

# See both Deployments
kubectl get deployments -n taskflow
# taskflow-web-blue    2/2   <- receiving traffic
# taskflow-web-green   2/2   <- running but idle

# Check which colour the Service is routing to
kubectl get svc web -n taskflow -o jsonpath='{.spec.selector}'
# {"app":"web","color":"blue"}

# Port-forward to GREEN directly — test without any traffic impact
kubectl port-forward deployment/taskflow-web-green 8080:80 -n taskflow

# Flip the switch (in a second terminal)
helm upgrade taskflow ./helm/blue-green -n taskflow --set web.productionTarget=green

# Check the selector changed
kubectl get svc web -n taskflow -o jsonpath='{.spec.selector}'
# {"app":"web","color":"green"}  <- cutover complete, instant

# Rollback in seconds if issues are found
helm upgrade taskflow ./helm/blue-green -n taskflow --set web.productionTarget=blue
```

> **What you just proved:** Traffic switching is atomic — it happens at the Service selector level, which Kubernetes updates instantly. There is no "in between" state where some pods are V1 and some are V2 receiving live traffic simultaneously.

### Advantages and Disadvantages

| Advantages | Disadvantages |
|---|---|
| Instant cutover — no gradual rollout | Requires **2x the resources** (both environments running) |
| Instant rollback — just flip the selector back | Database schema changes are still risky (both versions share DB) |
| New version fully tested before receiving any traffic | Cost doubles during the transition window |
| No mixed versions in production at the same time | Requires infrastructure to maintain two identical environments |
| Ideal for scheduled maintenance windows | Idle environment wastes compute (unless you scale it down) |

**When to use Blue-Green:**
- Critical services where any mixed-version state is unacceptable
- Scheduled release windows (e.g., deploy Sunday night, flip Monday morning)
- When you need the ability to roll back in under 1 second
- Avoid when resource costs are a constraint (you need 2x capacity)
- Avoid when your database schema changes between versions

---

## Strategy 3 — Canary Deployment

### Introduction

Canary deployment releases the new version to a **small percentage of users first**, monitors metrics and error rates, then gradually shifts more traffic if everything looks healthy. The name comes from the "canary in a coal mine" — a small signal that tells you if the environment is safe.

Unlike Blue-Green (all-or-nothing switch), Canary gives you **gradual, controlled exposure**:

```
                +---------------------------+
                |   Ingress / Traffic       |
                |   Splitter (NGINX)        |
                +------+--------------------+
                 90%   |   10%
        +--------v--+  +--v--------------+
        | Main (V1) |  | Canary (V2)    |
        | stable    |  | new version    |
        | 9 replicas|  | 1 replica      |
        +-----------+  +--------+-------+
                                |
                       +--------v-------+
                       | Monitor:       |
                       | - Error rate   |
                       | - P99 latency  |
                       | - CPU/Memory   |
                       +----------------+
```

This project implements Canary using **NGINX Ingress annotations** (`nginx.ingress.kubernetes.io/canary-weight`) to split traffic at the Ingress layer — no service mesh required.

![Canary Architecture](../assets/Canary.png)

*The Traffic Splitter sends 90% of requests to the main V1 deployment and 10% to the Canary V2 deployment. A "Canary Metrics: Healthy" panel shows the signal to watch. Only if metrics are clean do you increase the canary weight further.*

### How to Implement

This project implements Canary in `helm/canary/`. The mechanism uses two Ingress resources — one main and one canary — with NGINX traffic-splitting annotations.

**Canary Ingress** ([helm/canary/templates/api-ingress-canary.yaml](../helm/canary/templates/api-ingress-canary.yaml)):

```yaml
# This second Ingress tells NGINX to send a percentage of traffic
# to the canary Service instead of the main Service.
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: taskflow-api-ingress-canary
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"   # 10% of traffic to canary
spec:
  rules:
    - host: "taskflow.local"
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api-canary   # <- routes to canary Service, not main
                port:
                  number: 5000
```

**Canary Deployment** ([helm/canary/templates/api-deployment.yaml](../helm/canary/templates/api-deployment.yaml)):

```yaml
# Helm creates both a "stable" and "canary" Deployment from a single template
# range $track, $config := .Values.api.deployments
apiVersion: apps/v1
kind: Deployment
metadata:
  name: taskflow-api-canary      # or taskflow-api-stable
  labels:
    track: canary                # "stable" or "canary"
spec:
  replicas: 1                    # Small fleet for canary; stable has 9
  selector:
    matchLabels:
      track: canary
  template:
    metadata:
      labels:
        track: canary
    spec:
      containers:
        - name: api
          image: "ghcr.io/senghaniheet/taskflow-api:v2.0.0"
          # readiness + liveness probes omitted for brevity — same as stable
```

**Values file — controlling traffic weight:**

```yaml
# helm/canary/values.yaml
api:
  deployments:
    stable:
      enabled: true
      replicaCount: 9       # 90% of capacity
      image:
        tag: "v1.0.0"       # Stable production version

    canary:
      enabled: true
      replicaCount: 1       # 10% of capacity
      weight: "10"          # NGINX sends 10% of traffic here
      image:
        tag: "v2.0.0"       # New version under test
```

**Gradual promotion workflow:**

```bash
# Step 1: Start small — 10% canary
helm upgrade taskflow ./helm/canary -n taskflow \
  --set api.deployments.canary.weight=10

# Step 2: Monitor for 15-30 min in Grafana:
#   - HTTP error rate (should stay near 0%)
#   - P99 request latency (should not spike)
#   - Canary pod CPU/memory (should be stable)

# Step 3: Increase to 30%
helm upgrade taskflow ./helm/canary -n taskflow \
  --set api.deployments.canary.weight=30

# Step 4: Increase to 50%
helm upgrade taskflow ./helm/canary -n taskflow \
  --set api.deployments.canary.weight=50

# Step 5: Full promotion — update stable image tag
helm upgrade taskflow ./helm/canary -n taskflow \
  --set api.deployments.canary.weight=100 \
  --set api.deployments.stable.image.tag="v2.0.0"

# Emergency rollback at any step
helm upgrade taskflow ./helm/canary -n taskflow \
  --set api.deployments.canary.weight=0 \
  --set api.deployments.canary.enabled=false
```

### Try It: Observe Canary Traffic Splitting

```bash
# Deploy the canary chart
helm upgrade --install taskflow ./helm/canary -n taskflow --create-namespace

# See both Deployments (stable + canary)
kubectl get deployments -n taskflow
# taskflow-api-stable   9/9
# taskflow-api-canary   1/1

# See BOTH Ingress resources (main + canary)
kubectl get ingress -n taskflow
# taskflow-api-ingress         (main — no canary annotation)
# taskflow-api-ingress-canary  (has canary-weight annotation)

# Inspect the canary Ingress to see the weight annotation
kubectl describe ingress taskflow-api-ingress-canary -n taskflow
# Annotations: nginx.ingress.kubernetes.io/canary: true
#              nginx.ingress.kubernetes.io/canary-weight: 10

# Watch canary pod logs in Terminal 1
kubectl logs -l track=canary -n taskflow -f

# Send 100 requests in Terminal 2 — roughly 10 should hit canary
for i in $(seq 1 100); do curl -s http://taskflow.local/api/health > /dev/null; done

# Increase canary weight to 50%
helm upgrade taskflow ./helm/canary -n taskflow \
  --set api.deployments.canary.weight=50
```

> **What you just proved:** NGINX Ingress traffic splitting lets you send a precise percentage of real production traffic to a new version — all without touching the stable Deployment, using nothing but an annotation change.

### Monitoring Canary Health in Grafana

Navigate to **Grafana -> Explore** and use these PromQL queries to validate your canary:

```promql
# HTTP error rate by track (stable vs canary)
sum(rate(http_requests_total{status=~"5..", namespace="taskflow"}[5m])) by (track)
/
sum(rate(http_requests_total{namespace="taskflow"}[5m])) by (track)

# P99 latency by track
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket{namespace="taskflow"}[5m])) by (le, track)
)
```

> If canary error rate rises above 1% or P99 latency spikes, run the emergency rollback immediately.

### Advantages and Disadvantages

| Advantages | Disadvantages |
|---|---|
| Smallest blast radius — only N% of users affected | Most complex setup (two Ingresses, two Deployments, monitoring required) |
| Data-driven promotion — real traffic validates the new version | Requires robust observability (metrics, alerts) to detect problems |
| Easy progressive promotion (10% -> 30% -> 50% -> 100%) | Both versions run simultaneously — need API backward compatibility |
| Emergency rollback at any time without full redeployment | NGINX weight is approximate — not guaranteed exact percentages |
| Enables A/B testing alongside safety validation | Canary users may see inconsistent experience between requests |

**When to use Canary:**
- High-stakes changes where you want real-world validation before full rollout
- When you have solid Grafana/Prometheus dashboards to monitor key metrics
- Performance-sensitive changes (new algorithm, database query optimisation)
- A/B testing new UI or API behaviour
- Avoid when old and new API versions are incompatible (breaking changes)

---

## Strategy Comparison At a Glance

```
ROLLING UPDATE
-----------------------------------------------------
  Complexity:  [##........]  Low
  Risk:        [###.......]  Low-Medium
  Rollback:    [####......]  Seconds (kubectl rollout undo)
  Resources:   [##........]  +1 extra pod during transition
  Use when:    Everyday releases, simple upgrades

BLUE-GREEN
-----------------------------------------------------
  Complexity:  [#####.....]  Medium
  Risk:        [##........]  Very Low
  Rollback:    [##########]  Instant (flip selector)
  Resources:   [#########.]  2x (both envs running simultaneously)
  Use when:    Critical services, scheduled windows

CANARY
-----------------------------------------------------
  Complexity:  [########..]  High
  Risk:        [#.........]  Minimal (small % of users)
  Rollback:    [########..]  Fast (set weight=0)
  Resources:   [####......]  Slightly more (small canary fleet)
  Use when:    High-stakes changes, A/B testing
```

---

## Hands-On Challenge

**Goal:** Experience all three strategies by deploying each Helm chart and observing the traffic routing differences.

```bash
# ---- Part 1: Rolling Update --------------------------------

# Deploy the main taskflow chart
helm upgrade --install taskflow ./helm/taskflow -n taskflow --create-namespace

# Terminal 1: Watch pods
kubectl get pods -n taskflow -w

# Terminal 2: Trigger a rolling restart
kubectl rollout restart deployment/taskflow-api -n taskflow

# Observe: new pods become Ready before old ones terminate
kubectl rollout status deployment/taskflow-api -n taskflow

# ---- Part 2: Blue-Green ------------------------------------

# Deploy blue-green chart (both colours start up)
helm upgrade --install taskflow ./helm/blue-green -n taskflow

# Check which colour is live
kubectl get svc web -n taskflow -o jsonpath='{.spec.selector.color}'

# Silently test the idle environment
kubectl port-forward deployment/taskflow-web-green 8080:80 -n taskflow &
curl http://localhost:8080   # Talk to green without affecting production

# Cut over — all traffic switches instantly
helm upgrade taskflow ./helm/blue-green -n taskflow \
  --set web.productionTarget=green

# Verify
kubectl get svc web -n taskflow -o jsonpath='{.spec.selector.color}'
# Should output: green

# ---- Part 3: Canary ----------------------------------------

# Deploy canary chart (stable + canary track)
helm upgrade --install taskflow ./helm/canary -n taskflow

# Inspect ingress annotations
kubectl get ingress -n taskflow
kubectl describe ingress taskflow-api-ingress-canary -n taskflow

# Simulate traffic (watch which pod logs light up)
kubectl logs -l track=canary -n taskflow &
for i in $(seq 1 50); do curl -s http://taskflow.local/api/health; done

# Promote canary weight step by step
helm upgrade taskflow ./helm/canary -n taskflow \
  --set api.deployments.canary.weight=30
# Wait and monitor in Grafana ...
helm upgrade taskflow ./helm/canary -n taskflow \
  --set api.deployments.canary.weight=50
```

**What to observe:**
- **Rolling update:** Pods replaced one at a time; readiness probe gates each step; `kubectl rollout undo` reverts instantly
- **Blue-Green:** Both environments run simultaneously; cutover is a single selector update; rollback is the same flip in reverse
- **Canary:** Two Ingress objects; NGINX weight annotation controls the exact split percentage; Grafana shows per-track error rates

---

**Next:** [Next Chapter](../KUBERNETES_GRAFANA_PROMETHEUS_GUIDE.md) *(or revisit any chapter in the curriculum)*