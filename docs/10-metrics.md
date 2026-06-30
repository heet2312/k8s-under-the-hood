# 10 — Metrics: Prometheus and PromQL

> **Prerequisites:** [09 — Load Testing](./09-load-testing.md)

---

## 🧠 Theory: The Prometheus Pull Model

Most observability systems (Datadog, New Relic, Loki) use a **push model**: your application actively sends data over the network to the backend.

Prometheus uses a **pull model** (scraping):
1. Your app exposes a local HTTP endpoint (usually `/metrics`)
2. Prometheus periodically makes an HTTP GET request to that endpoint
3. Prometheus parses the text response and stores it as time-series data

### Why Pull?

| Benefit | Explanation |
|---------|-------------|
| **No app config needed** | The app doesn't know where Prometheus is — it just opens a port |
| **Fail-safe** | If Prometheus goes down, the app is unaffected. If the app goes down, Prometheus knows instantly because the scrape fails |
| **Service Discovery** | Prometheus asks the Kubernetes API "where are all the pods?" and auto-discovers their IPs |

---

## The `/metrics` Endpoint Format

When Prometheus hits `/api/metrics`, it expects plain text in **OpenMetrics** format:

```text
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/workspaces",status="200"} 452
http_requests_total{method="POST",route="/api/workspaces",status="201"} 12
http_requests_total{method="GET",route="/api/workspaces",status="500"} 3
```

- `# HELP` — human-readable description
- `# TYPE` — counter, gauge, histogram, or summary
- Labels `{...}` — dimensions that let you slice the data
- The number at the end — the current value

> **Note:** There are no timestamps — Prometheus adds the timestamp at the exact moment it scrapes.

---

## Metric Types

| Type | Behaviour | Example Use Case |
|------|-----------|-----------------|
| **Counter** | Only goes up (resets on restart) | Total HTTP requests, total errors |
| **Gauge** | Goes up and down | Current active connections, memory usage |
| **Histogram** | Samples observations into configurable buckets | Request duration (enables p50, p95, p99) |
| **Summary** | Like histogram but pre-calculated quantiles | Less flexible; prefer Histogram |

---

## PromQL: Querying Prometheus

PromQL is how you ask questions about your metrics. You used the results in Chapter 09's dashboard — now you'll understand what they mean.

### 1. Instant Vectors — Current Value

```promql
# All time series for this metric right now
http_requests_total

# Narrow to only 500 errors
http_requests_total{status="500"}

# Regex match — all 5xx errors
http_requests_total{status=~"5.."}

# All routes EXCEPT health checks
http_requests_total{route!="/api/health"}
```

### 2. Rate — The Most Important Function

`http_requests_total` is a counter — it only ever goes up. The raw number (e.g., 452,000) doesn't tell you if the system is under heavy load *right now*. You need **rate**.

```promql
# Per-second rate of requests over the last 5 minutes
rate(http_requests_total[5m])

# This reads: "how many requests per second happened, averaged over 5 minutes?"
# If you see 150, that means 150 req/s — matches the Grafana RPS panel you watched!
```

> **Rule of thumb:** Always wrap counters in `rate()`. Raw counter values are rarely useful.

### 3. Aggregation — Combining Multiple Pods

When you have 5 API pods, you get 5 separate time series. Aggregate them:

```promql
# Total RPS across ALL api pods
sum(rate(http_requests_total[5m]))

# RPS broken down by HTTP method
sum by (method) (rate(http_requests_total[5m]))

# RPS broken down by route — useful for finding the busiest endpoints
sum by (route) (rate(http_requests_total[5m]))
```

### 4. Percentiles from Histograms

Request duration is a histogram. To get the 95th percentile:

```promql
# p95 request duration in seconds
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))

# Convert to milliseconds for readability
histogram_quantile(0.95,
  sum by (le) (rate(http_request_duration_seconds_bucket[5m]))
) * 1000
```

### 5. Kubernetes Metrics

Besides your custom Node.js metrics, Prometheus scrapes Kubernetes itself:

```promql
# How many API replicas are currently available?
kube_deployment_status_replicas_available{namespace="taskflow", deployment="taskflow-api"}

# Pod memory usage in MB
sum by (pod) (container_memory_usage_bytes{namespace="taskflow", container="api"}) / 1024 / 1024

# Is any pod in CrashLoopBackOff?
kube_pod_container_status_waiting_reason{namespace="taskflow", reason="CrashLoopBackOff"}
```

---

## 🔍 In This Project

### Exposing Metrics from Node.js

The `prom-client` library in the API registers metrics and exposes the `/api/metrics` route:

```javascript
// Counter: incremented on every request
const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status'],
});

// Histogram: records how long each request took
const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
});

// Expose the endpoint
app.get('/api/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});
```

### Telling Prometheus to Scrape It
**File:** [`helm/taskflow/templates/api-servicemonitor.yaml`](../helm/taskflow/templates/api-servicemonitor.yaml)

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
spec:
  selector:
    matchLabels:
      app: api       # Scrape any service with this label
  endpoints:
    - port: http
      path: /api/metrics
      interval: 5s   # Scrape every 5 seconds
```

---

## 🛠️ Hands-On: Build the Backend Observability Dashboard

In Chapter 09 you watched a pre-built dashboard. Now you will **build one yourself** from scratch using the PromQL you just learned — then compare it against the reference dashboard.

### Step 1 — Open Grafana Explore and Test Queries

```bash
kubectl port-forward svc/monitoring-grafana -n monitoring 8080:80
```

Go to **http://localhost:8080/explore**, select **Prometheus** as the datasource.

Paste and run each query to understand its output before adding it to a dashboard:

**Query A — API pod count (you should see 3 or 5 depending on HPA):**
```promql
kube_deployment_status_replicas_available{namespace="taskflow", deployment="taskflow-api"}
```

**Query B — Requests per second:**
```promql
sum(rate(http_requests_total{namespace="taskflow"}[2m]))
```

**Query C — p95 response time (ms):**
```promql
histogram_quantile(0.95,
  sum by (le) (rate(http_request_duration_seconds_bucket{namespace="taskflow"}[5m]))
) * 1000
```

**Query D — HTTP error rate (5xx only):**
```promql
sum(rate(http_requests_total{namespace="taskflow", status=~"5.."}[2m]))
/
sum(rate(http_requests_total{namespace="taskflow"}[2m]))
* 100
```

**Query E — Memory usage per pod (MB):**
```promql
sum by (pod) (
  container_memory_usage_bytes{namespace="taskflow", container="api"}
) / 1024 / 1024
```

---

### Step 2 — Create a New Dashboard

1. Go to **Dashboards → New → New Dashboard**
2. Click **Add visualization**

---

### Step 3 — Add Panel 1: Requests Per Second

- **Datasource:** Prometheus
- **Query:** Paste Query B from above
- **Panel title:** `API Requests / sec`
- **Visualization:** Time series
- **Unit** (right panel → Standard options → Unit): `requests/sec`
- Click **Apply**

---

### Step 4 — Add Panel 2: API Pod Count

- Click **Add panel → Add visualization**
- **Query:** Paste Query A
- **Panel title:** `API Pod Count`
- **Visualization:** Stat (shows a single large number)
- **Unit:** `short`
- **Thresholds:** Add threshold at 5 (orange) and 8 (red) to highlight when HPA fires heavily
- Click **Apply**

---

### Step 5 — Add Panel 3: p95 Response Time

- **Query:** Paste Query C
- **Panel title:** `p95 Response Time`
- **Visualization:** Gauge
- **Unit:** `ms`
- **Thresholds:** 100ms (green), 250ms (orange), 500ms (red)
- Click **Apply**

---

### Step 6 — Add Panel 4: HTTP Error Rate %

- **Query:** Paste Query D
- **Panel title:** `HTTP 5xx Error Rate`
- **Visualization:** Time series
- **Unit:** `percent (0-100)`
- **Thresholds:** 0.1% (orange), 1% (red)
- Click **Apply**

---

### Step 7 — Add Panel 5: Memory Usage per Pod

- **Query:** Paste Query E
- **Panel title:** `API Memory per Pod (MB)`
- **Visualization:** Time series
- **Unit:** `MB`
- Click **Apply**

---

### Step 8 — Save and Compare

1. Click **Save** (top-right) → name it **"TaskFlow — My Backend Dashboard"**
2. Now **import the reference dashboard** to compare:
   - **Dashboards → Import → Upload JSON**
   - Select **`monitoring/taskflow-backend-observability.json`**
3. Open both dashboards side by side in separate browser tabs

> **What to notice:** Your panels should show the same data shapes as the reference. The reference may have extra panels (status code breakdown, histogram heatmap) — these use the same PromQL building blocks you just learned.

---

### Generate Fresh Data to Populate the Panels

If your panels show "No data", generate some traffic:

```bash
# Generate a burst of requests
for i in $(seq 1 50); do
  curl -s http://taskflow.local/api/workspaces > /dev/null
  curl -s http://taskflow.local/api/health > /dev/null
done

# Wait ~10 seconds for Prometheus to scrape, then refresh Grafana
```

---

**What you proved:**
- PromQL `rate()` converts a raw counter into a useful per-second rate
- `histogram_quantile()` extracts latency percentiles — the single most important production metric
- `sum by (pod)` lets you see which specific pod is the outlier
- The panels you built are reading the exact same data that drove HPA decisions in Chapter 09

---

**Next:** [11 — Logging: Loki, Promtail, and LogQL →](./11-logging.md)
