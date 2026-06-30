# 14 — Logging: Loki, Promtail, and LogQL

> **Prerequisites:** [Previous Chapter](./13-metrics.md)

---

## 🧠 Theory: Modern Logging in Kubernetes

### The Problem with Files

In traditional servers you configure your app to write logs to `/var/log/myapp.log`, SSH in, and use `grep` or `tail` to read them.

In Kubernetes, Pods are ephemeral. If a Pod crashes and restarts, its local filesystem is **destroyed**. SSHing into a Pod to read a file is an anti-pattern.

### The Kubernetes Pattern: stdout → Host Node → Collector

In Kubernetes, **your application writes only to `stdout` and `stderr`**.

Kubernetes intercepts everything written to stdout/stderr and writes it to the **host Node** at `/var/log/pods/`. Log collectors (like Promtail) tail those files — without needing to be inside your container.

```
App (inside container)
  → stdout/stderr
  → K8s writes to: /var/log/pods/<namespace>/<pod>/<container>.log
  → Promtail (DaemonSet) tails that file
  → Promtail pushes to Loki
  → Loki stores + indexes labels
  → Grafana queries Loki via LogQL
```

### The Problem with Plain Text Logs

```text
2024-01-15T10:00:00Z INFO User login successful user_id=123 ip=192.168.1.1
```

Human-readable, but terrible for machines. Searching for all logins from a specific IP requires brittle regex.

### The Solution: Structured JSON Logging

```json
{"timestamp":"2024-01-15T10:00:00Z","level":"info","message":"User login","user_id":"123","ip":"192.168.1.1"}
```

Every field is a key-value pair. Log aggregation systems can instantly filter by `level`, `user_id`, or any other field — no regex needed.

---

## The Loki + Promtail Stack

### 🌿 Promtail — The Collector (DaemonSet)

Promtail is deployed as a **DaemonSet** — exactly one Pod runs on every Node.

1. It mounts the Node's `/var/log/pods/` directory
2. It tails log files from all containers on that Node
3. It queries the Kubernetes API to enrich each log with labels (`namespace`, `pod`, `container`, `app`)
4. It pushes batches to Loki via HTTP POST

### 🪵 Loki — The Store

Loki is intentionally minimal. The key architectural difference vs Elasticsearch (ELK):

| | Loki | Elasticsearch |
|--|------|--------------|
| **Indexes** | Only labels (namespace, pod, level) | Full log content |
| **Cost at scale** | Very cheap (object storage) | Expensive (RAM + disk) |
| **Query speed** | Fast on labels, slower for content search | Fast for all searches |
| **Setup** | Simple | Complex |

Because Loki and Prometheus share the same label model, you can **pivot** from a Prometheus metric (CPU spike on `pod="api-abc"`) directly to the Loki logs for that specific pod.

---

## LogQL: Querying Loki

LogQL is Loki's query language. It has two parts:

```
{namespace="taskflow", container="api"} | json | level = "error"
 ↑─────────────────────────────────────  ↑───── ↑──────────────
 Stream selector (label filter - FAST)   Parser  Content filter (slower)
```

### Stream Selector — Always First

```logql
# All logs from the api container in the taskflow namespace
{namespace="taskflow", container="api"}

# Logs from any pod whose name starts with "mongo"
{namespace="taskflow", pod=~"mongo.*"}

# Logs from multiple containers (regex OR)
{namespace="taskflow", container=~"api|web"}
```

### Log Pipeline — Filter and Parse

Chain stages with `|`:

```logql
# Text search (fast)
{namespace="taskflow", container="api"} |= "error"
{namespace="taskflow", container="api"} != "debug"

# Parse JSON fields (makes them filterable)
{namespace="taskflow", container="api"} | json

# After json parsing — filter on extracted fields
{namespace="taskflow", container="api"} | json | level = "error"
{namespace="taskflow", container="api"} | json | level = "error" | message =~ ".*mongo.*"

# Format the output for readability
{namespace="taskflow", container="api"}
  | json
  | line_format "{{.timestamp}} [{{.level}}] {{.message}}"
```

### Metric Queries (LogQL → Numbers)

```logql
# Count error log lines per minute, grouped by container
sum by (container) (
  rate({namespace="taskflow"} | json | level="error" [1m])
)
```

This is how you can **alert on log error rates** from Grafana.

---

## 🔍 In This Project

### Structured Logging in the API
**File:** [`server/src/utils/logger.js`](../server/src/utils/logger.js)

```javascript
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',   // controlled via ConfigMap
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()                    // every log line is valid JSON on stdout
  ),
  transports: [new winston.transports.Console()],
});
```

Every log line from the API arrives in Loki as parseable JSON — no custom Promtail pipeline needed.

---

## 🛠️ Hands-On: Explore Logs and Import the Log Dashboard

### Step 1 — Verify the Loki Datasource

In Grafana (**http://localhost:8080**):

1. Go to **Home → Connections → Data Sources**
2. Click on **Loki**
3. Scroll down and click **Save & Test**
4. You should see: `"Data source connected and labels found."`

If it fails:
```bash
# Check Loki is running
kubectl get pods -n monitoring | grep loki
# loki-stack-0   1/1   Running   ← expected

# Check Promtail is running on all nodes
kubectl get pods -n monitoring | grep promtail
# promtail-xxxxx   2/2   Running   ← one per node

# Check Loki can receive logs
kubectl port-forward svc/loki-stack -n monitoring 3100:3100 &
curl "http://localhost:3100/loki/api/v1/labels"
# {"status":"success","data":["container","namespace","pod", ...]}
```

---

### Step 2 — Explore Logs in Grafana

Go to **Explore** (compass icon) → select **Loki** as the datasource.

**Query 1 — All API logs:**
```logql
{namespace="taskflow", container="api"}
```
You will see raw JSON lines. Click any line to expand it and see detected fields.

**Query 2 — Only errors:**
```logql
{namespace="taskflow", container="api"} | json | level = "error"
```

**Query 3 — Generate errors to see them in Loki:**
```bash
# In your terminal — hit a route that doesn't exist
for i in $(seq 1 5); do curl -s http://taskflow.local/api/this-does-not-exist > /dev/null; done
```
Go back to Grafana and re-run Query 2 — you should see the 404 log entries appear.

**Query 4 — Pretty-print the output:**
```logql
{namespace="taskflow", container="api"}
  | json
  | line_format "{{.timestamp}} [{{.level}}] {{.message}}"
```

**Query 5 — Pivot from a specific pod (like you would during an incident):**
```bash
# Get the exact pod name
kubectl get pods -n taskflow -l app=api --no-headers | head -1 | awk '{print $1}'
```
```logql
{namespace="taskflow", pod="<paste-pod-name-here>"}
  | json
  | level = "error"
```
> **This is the production workflow:** Prometheus alerts → find the faulty pod → pivot to its Loki logs.

---

### Step 3 — Import the Log Dashboard

This project includes a pre-built log dashboard with namespace/container/level filter dropdowns.

1. Go to **Dashboards → Import → Upload dashboard JSON file**
2. Select **`monitoring/log-dashboard.json`**
3. Set the **Loki** datasource when prompted → click **Import**

You will see the **TaskFlow — Log Dashboard** with:

| Feature | What it does |
|---------|-------------|
| **Namespace dropdown** | Filter logs to `taskflow` or `monitoring` |
| **Container dropdown** | Switch between `api`, `web`, `mongo` |
| **Level dropdown** | Filter by `info`, `http`, `warn`, `error` |
| **Log panel** | Live scrolling log stream with syntax highlights |

---

### Step 4 — Understand the Complex LogQL Pipeline

Look at the raw query powering the log panel (click the panel → Edit):

```logql
{namespace="$namespace", container="$container"}
  | json
  | line_format "{{.log}}"
  | json
  | regexp "(?P<http_match>HTTP/1\..+ \d{3})"
  | label_format level="{{if .level}}{{.level}}{{else if .http_match}}http{{else}}info{{end}}"
  | level =~ "(?i)$level"
```

**How this pipeline works step by step:**

1. `{namespace="$namespace", container="$container"}` — Grafana replaces `$namespace` and `$container` with your dropdown selections
2. `| json` — First parse: Minikube's Docker driver wraps the container stdout in its own JSON envelope
3. `| line_format "{{.log}}"` — Extract the inner `.log` field (the actual app output)
4. `| json` — Second parse: Now parse the actual app JSON (Winston output)
5. `| regexp "..."` — Detect Nginx HTTP access logs (they don't have a `level` field)
6. `| label_format level="{{if .level}}...{{end}}"` — Assign a `level` label conditionally:
   - API logs have `.level` from Winston → use it directly
   - Nginx logs match the HTTP pattern → label them `http`
   - Anything else → default to `info`
7. `| level =~ "(?i)$level"` — Apply the level dropdown filter

> **Try it:** Set Level to `error` in the dropdown. Only error lines appear. Set to `http` — only Nginx access logs. This is the power of Loki's label model combined with LogQL's pipeline.

---

**What you proved:**
- Kubernetes' stdout-based logging model means **zero code changes** are needed to get logs into Loki
- LogQL's label-first filtering makes log search fast even at scale
- The double-JSON pipeline is a real-world pattern for handling log format differences across services

---

## 🔗 What's Coming: Connecting Logs to Traces

In this chapter, you saw that our Node.js API produces structured JSON logs via Winston. If you looked closely at the raw logs in Loki, you might have noticed two special fields in some entries: `trace_id` and `span_id`.

These fields are **not** generated by Winston itself. They are automatically injected by **OpenTelemetry** instrumentation (which we'll explore in the next chapter). 

Because we've set up a structured JSON logging pipeline that preserves these fields, Loki indexes them. This unlocks a powerful capability: **Seamless Correlation**.

In the next chapter, we will configure Grafana so that whenever you view a log line containing a `trace_id`, you can click a button right next to the log entry to instantly jump into **Tempo** and see the exact distributed trace that generated that log line across all microservices.

**Bridging the gap with LogQL:**
Once we have tracing, you can even use LogQL to find all logs belonging to a specific trace:
```logql
{namespace="taskflow"} | json | trace_id = "1234567890abcdef"
```

Let's move on to Tracing to see this in action.

---

**Next:** [Next Chapter](./15-tracing.md)
