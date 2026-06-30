# 12 — Load Testing: Validating Autoscaling

> **Prerequisites:** [Previous Chapter](./11-observability-arch.md)

---

## 🧠 Theory: Why Load Test?

You've configured resource requests, limits, and an HPA. You watched it scale with `kubectl` in Chapter 07. But a single busybox health-check loop is not a real traffic pattern.

A real load test answers:
- Does HPA fire fast enough before pods become saturated?
- Does the database become a bottleneck when 10 pods hit it simultaneously?
- What is the p95 response time under 200 concurrent users?
- Does the system recover gracefully after load drops?

### What is k6?

[k6](https://k6.io/) is an open-source load testing tool from Grafana Labs. You write performance tests in JavaScript; k6 executes them using a highly optimised Go engine capable of simulating thousands of virtual users.

### The Problem with Local Load Testing

If you run a load test from your laptop against the cluster, you are testing your ISP's routing and the external load balancer — not your app's raw capacity.

### The Solution: The Load Generator Pod

Deploy k6 as a one-shot Pod **inside the cluster**. It sits right next to the application and blasts traffic directly at the internal Ingress controller Service — no network overhead, no external hops.

---

## Designing a Realistic Load Test

A good load test simulates real user behaviour — not just `/api/health` spam.

This project's test uses a randomised distribution:

| Traffic Type | Weight | Endpoint | Why |
|-------------|--------|----------|-----|
| GET workspaces | 40% | `/api/workspaces` | Light read — high frequency |
| GET tasks | 30% | `/api/workspaces/:id/tasks` | Medium read — joins involved |
| GET health | 20% | `/api/health` | Very light — baseline |
| POST workspace | 10% | `/api/workspaces` | Write — exercises DB locks |

This varied pattern is far more likely to reveal database contention or slow queries than hitting one endpoint repeatedly.

---

## The HPA Feedback Loop — What You Will Watch

When you start the load test, this exact sequence fires:

```
T=0s   → 200 Virtual Users begin hitting the API
T=5s   → CPU utilisation across 3 API pods: 2% → ~95%
T=15s  → Prometheus scrapes /api/metrics + cAdvisor metrics
T=30s  → HPA controller evaluates: avg CPU 95%, target 60%
T=35s  → Desired replicas = ceil(3 × (95/60)) = ceil(4.75) = 5
         HPA patches: deployment.spec.replicas = 5
T=40s  → 2 new API pods scheduled → Pending → Running
T=45s  → New pods pass readiness probes → added to Service load balancer
T=50s  → Traffic split across 5 pods → CPU per pod drops to ~57%
T=55s  → HPA satisfied (57% < 60% target) — no further scaling
```

This is the sequence that keeps production systems alive during traffic surges.

---

## 🔍 In This Project

### The k6 Script
**File:** [`server/tests/load/loadtest.js`](../server/tests/load/loadtest.js)

```javascript
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
    vus: 200,          // 200 concurrent virtual users
    duration: '5m',    // run for 5 minutes
};

export default function () {
    const baseUrl = __ENV.API_URL;
    const params = { headers: { 'Host': 'taskflow.local', 'Content-Type': 'application/json' } };
    const random = Math.random();

    if (random < 0.40) {
        http.get(`${baseUrl}/api/workspaces`, params);
    } else if (random < 0.70) {
        http.get(`${baseUrl}/api/workspaces/1/tasks`, params);
    } else if (random < 0.90) {
        http.get(`${baseUrl}/api/health`, params);
    } else {
        http.post(`${baseUrl}/api/workspaces`, JSON.stringify({ name: 'Load Test WS' }), params);
    }

    sleep(Math.random() * 1.5 + 0.25); // dynamic wait between requests
}
```

### The k6 Kubernetes Pod
**File:** [`server/tests/load/loadtest-pod.yaml`](../server/tests/load/loadtest-pod.yaml)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: k6-load-generator
  namespace: taskflow
spec:
  restartPolicy: Never   # one-shot job — don't restart when finished
  containers:
    - name: k6
      image: grafana/k6:latest
      command: ["k6", "run", "/scripts/loadtest.js"]
      volumeMounts:
        - name: scripts
          mountPath: /scripts
      env:
        # Bypass the external minikube IP — hit the internal Ingress directly
        - name: API_URL
          value: "http://ingress-nginx-controller.ingress-nginx.svc.cluster.local"
  volumes:
    - name: scripts
      configMap:
        name: loadtest-config
```

---

## 🛠️ Hands-On Challenge

**Goal:** Fire a real load test. Watch HPA auto-scale via `kubectl` AND observe it on the Grafana dashboard you imported in Chapter 08.

### Setup — Open Four Terminals + Grafana

```bash
# Terminal 1: Watch HPA react in real time
kubectl get hpa -n taskflow -w

# Terminal 2: Watch pods spin up
kubectl get pods -n taskflow -w

# Terminal 3: Watch live resource usage
kubectl top pods -n taskflow
# Run this periodically — it shows CPU/memory per pod right now
```

In your browser, open **http://localhost:8080** (Grafana).
Navigate to **Dashboards → TaskFlow — Application Metrics**.

> **Tip:** If the port-forward dropped, restart it:
> ```bash
> kubectl port-forward svc/monitoring-grafana -n monitoring 8080:80
> ```

---

### Part 1 — Launch the Load Test

```bash
# Step 1: Package the k6 script into a ConfigMap
kubectl create configmap loadtest-config \
  --from-file=loadtest.js=server/tests/load/loadtest.js \
  -n taskflow

# Step 2: Launch the k6 Pod
kubectl apply -f server/tests/load/loadtest-pod.yaml

# Confirm it started
kubectl get pod k6-load-generator -n taskflow
# STATUS: Running
```

---

### Part 2 — Observe the Scaling (kubectl + Grafana Together)

**Watch Terminal 1 (HPA):**
```
NAME              REFERENCE                   TARGETS         MINPODS   MAXPODS   REPLICAS
taskflow-api-hpa  Deployment/taskflow-api     5%/60%          3         10        3
taskflow-api-hpa  Deployment/taskflow-api     92%/60%         3         10        3   ← load hits
taskflow-api-hpa  Deployment/taskflow-api     92%/60%         3         10        5   ← HPA fires
taskflow-api-hpa  Deployment/taskflow-api     57%/60%         3         10        5   ← CPU stable
```

**Watch Terminal 2 (pods):**
```
NAME                           READY   STATUS    
taskflow-api-abc               1/1     Running
taskflow-api-def               1/1     Running
taskflow-api-ghi               1/1     Running
taskflow-api-NEW-xyz           0/1     Pending   ← new pod starting
taskflow-api-NEW-xyz           1/1     Running   ← passes readiness probe → now serving
```

**Watch Grafana (dashboard):**
- **RPS panel** — jumps from ~0 to ~150 requests/sec
- **API Pod Count panel** — ticks up from 3 → 5 (or higher)
- **CPU Utilisation panel** — spikes, then drops once new pods absorb traffic
- **HTTP Error Rate** — should stay at 0 if the app scales fast enough

---

### Part 3 — Read the k6 Final Report

Once the 5 minutes are up (or stop it early with `kubectl delete pod k6-load-generator -n taskflow`):

```bash
kubectl logs k6-load-generator -n taskflow
```

Key metrics to read:
```
http_req_duration............: avg=24ms  p(90)=45ms  p(95)=67ms  p(99)=120ms
http_req_failed..............: 0.00%    ✗ 0         ← no errors!
http_reqs....................: 45231    150.77/s    ← requests per second
vus..........................: 200                  ← peak virtual users
```

> **What to look for:**
> - `p(95)` under 200ms — your app handled load comfortably
> - `http_req_failed` at 0% — no requests dropped during scale-up
> - `http_reqs/s` matching what you saw in the Grafana RPS panel

---

### Part 4 — Watch Scale-Down

```bash
# After the test ends, watch slow scale-down
kubectl get hpa -n taskflow -w
```

The HPA waits **5 minutes** before scaling back down (the stabilisation window prevents thrashing). This is intentional — a sudden traffic spike could return within that window.

---

### Clean Up

```bash
kubectl delete pod k6-load-generator -n taskflow
kubectl delete configmap loadtest-config -n taskflow
```

---

**What you just proved:**
- HPA reacts within ~30–60 seconds of the CPU metric crossing the threshold
- Scale-up is fast (seconds); scale-down is deliberately slow (minutes)
- The Grafana dashboard panels match exactly what `kubectl` reported — they are reading the same underlying metrics

> **Bridge:** You have seen the system under stress. In the next chapter you will learn the PromQL language powering those Grafana panels — and build a new dashboard from scratch using the data you just generated.

---

**Next:** [Next Chapter](./13-metrics.md)
