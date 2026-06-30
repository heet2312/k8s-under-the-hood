# 15 — Distributed Tracing: OpenTelemetry and Tempo

> **Prerequisites:** [Previous Chapter](./14-logging.md)

---

## 🧠 Theory: The "Where Is It Slow?" Problem

Imagine a user clicks "Load Workspaces" and it takes 3 seconds.

- **Metrics** (Chapter 10) show: p95 latency spiked to 3000ms ← *something is slow*
- **Logs** (Chapter 11) show: `HTTP GET /api/workspaces status=200 duration=3000ms` ← *which request*
- **Traces** (this chapter) show: the MongoDB query took 2.8 of those 3 seconds ← *why it's slow*

Without tracing, the application is a black box. You can see *that* it's slow but not *where*. Distributed Tracing opens the black box.

---

## Key Concepts

### Spans — The Building Blocks

A **span** represents one unit of work. Every span records:
- Operation name (e.g., `GET /api/workspaces`)
- Start time and duration
- Status (OK / ERROR)
- Attributes (e.g., `db.statement`, `http.status_code`)

### Traces — The Full Picture

A **trace** is a tree of spans representing one end-to-end request:

```
Trace: GET /api/workspaces  (total: 2847ms)
├── Express middleware         (4ms)
├── JWT verification           (3ms)
├── MongoDB: db.workspaces.find()  (2830ms)  ← the bottleneck!
│   └── TCP connection pool    (12ms)
│   └── Query execution        (2818ms)
└── JSON serialisation         (10ms)
```

One glance at the trace waterfall and you know where the time went.

### Trace ID — Correlating Across Services

When Service A calls Service B, OTel injects a `traceparent` HTTP header containing the **trace ID**. Service B reads it and attaches its spans to the same trace. You get one unified tree even across microservices.

---

## OpenTelemetry (OTel)

OpenTelemetry is a vendor-neutral open standard for instrumentation. It replaces vendor-specific agents (Datadog's, New Relic's) with a single SDK.

### Components

| Component | Role |
|-----------|------|
| **API** | Interfaces for creating custom spans in your code |
| **SDK** | The engine — manages spans, batches them, exports them |
| **Auto-instrumentations** | Hook into Express, Mongoose, HTTP automatically — zero code changes |
| **OTLP** | OpenTelemetry Protocol — the wire format for shipping spans (usually gRPC) |

### Why Auto-Instrumentation Matters

With auto-instrumentation enabled, the OTel SDK automatically wraps:
- **Every incoming HTTP request** → creates a root span with URL, method, status code
- **Every MongoDB query** → creates a child span with the query string
- **Every outgoing HTTP call** → creates a child span with the target URL

You get the full trace waterfall **without writing a single line of tracing code** in your application.

---

## Grafana Tempo

Tempo is the tracing backend. Like Loki is to logs, Tempo is to traces.

**Why Tempo?**
- Only indexes `trace_id` and basic metadata — the large span payloads are stored cheaply
- Designed to scale to millions of traces per day on object storage (S3/GCS)
- Natively integrated with Grafana — drill from a Grafana metric alert directly into related traces

---

## The ESM Gotcha: Why `--import`?

Historically, APM tools used `require('agent')` at the top of `index.js`. They intercepted `require()` calls to wrap libraries before the app loaded them.

With **ES Modules (`import`)**, this doesn't work — imports are hoisted and resolved before any code runs. You cannot intercept them from inside `index.js`.

**The Fix:** Use Node's `--import` flag to load the OTel SDK *before* the Node.js runtime even starts parsing your app code:

```
NODE_OPTIONS="--import ./src/instrumentation.js"
```

Node sees this environment variable and runs `instrumentation.js` first, so OTel wraps Express and Mongoose before the main app loads.

---

## The Dependency Gotcha: Mongoose & OTel Version Lock

In `package.json`, `mongoose` is locked to version `8.4.1`. Here's why:

1. The OTel auto-instrumentation hooks into the `mongodb` driver
2. Mongoose `8.5.0+` upgraded its internal `mongodb` dependency to `6.8.0`
3. The OTel library was not yet compatible with `mongodb 6.8.0` — causes a fatal crash: `Unexpected null cursor id`

**Lesson:** Auto-instrumentation is powerful, but it tightly couples your observability stack to the exact versions of your database drivers. Always check OTel compatibility before upgrading database libraries.

---

## 🔍 In This Project

### 1. The OTel Bootstrap File
**File:** [`server/src/instrumentation.js`](../server/src/instrumentation.js)

```javascript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),   // reads OTEL_EXPORTER_OTLP_ENDPOINT from env
  instrumentations: [ getNodeAutoInstrumentations() ],
});
sdk.start();
```

No host/port is hardcoded — the SDK reads `OTEL_EXPORTER_OTLP_ENDPOINT` from environment variables.

### 2. Injecting Config via ConfigMap
**File:** [`helm/taskflow/templates/api-configmap.yaml`](../helm/taskflow/templates/api-configmap.yaml)

```yaml
NODE_OPTIONS: "--import ./src/instrumentation.js"
OTEL_EXPORTER_OTLP_ENDPOINT: "http://tempo.monitoring.svc.cluster.local:4317"
OTEL_SERVICE_NAME: "taskflow-api"
```

When the Pod starts, Node.js reads `NODE_OPTIONS` and runs `instrumentation.js` before `index.js`. Spans are exported to Tempo via gRPC on port 4317.

### 3. Tempo Datasource — Auto-Provisioned by Helm
**File:** [`helm/taskflow/templates/tempo-datasource.yaml`](../helm/taskflow/templates/tempo-datasource.yaml)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: taskflow-tempo-datasource
  namespace: monitoring
  labels:
    grafana_datasource: "1"   # ← the magic label
data:
  tempo-datasource.yaml: |-
    apiVersion: 1
    datasources:
    - name: Tempo
      type: tempo
      access: proxy
      url: http://tempo.monitoring.svc.cluster.local:3200
      version: 1
      jsonData:
        httpMethod: GET
```

**How auto-provisioning works:**
1. `helm install taskflow ./helm/taskflow` creates this ConfigMap in the `monitoring` namespace
2. Grafana has a **sidecar container** that watches for ConfigMaps with the label `grafana_datasource: "1"`
3. When it finds one, it reads the data and adds the datasource to Grafana automatically
4. **No manual UI clicks needed** — every fresh cluster install has Tempo pre-configured

---

## 🛠️ Hands-On: Generate a Trace and Find the Bottleneck

### Step 1 — Verify the Tempo Datasource

In Grafana (**http://localhost:8080**):

1. Go to **Home → Connections → Data Sources**
2. Click on **Tempo**
3. Scroll down → click **Save & Test**
4. You should see: `"Data source is working"`

If it shows an error:
```bash
# Confirm the ConfigMap exists
kubectl get configmap -n monitoring | grep tempo
# taskflow-tempo-datasource   1   ...  ← should be present

# If missing, the Helm chart may not have been applied
# Reapply the taskflow chart:
helm upgrade taskflow ./helm/taskflow --namespace taskflow

# Check Tempo pod is running
kubectl get pods -n monitoring | grep tempo
# monitoring-tempo-0   1/1   Running  ← expected

# Check Tempo is receiving spans
kubectl logs -n monitoring -l app.kubernetes.io/name=tempo --tail=20
```

---

### Step 2 — Generate Traffic to Create Traces

```bash
# Make several requests to generate traces
for i in $(seq 1 10); do
  curl -s http://taskflow.local/api/workspaces > /dev/null
  curl -s http://taskflow.local/api/health > /dev/null
done

echo "Traces generated. Wait 5 seconds for export..."
sleep 5
```

---

### Step 3 — Find the Trace in Grafana

1. Go to **Explore** → select **Tempo** as the datasource
2. In the query builder:
   - **Query type:** Search
   - **Service Name:** `taskflow-api`
   - Click **Run query**
3. You will see a list of recent traces. Click any **Trace ID** to open it.

---

### Step 4 — Analyse the Trace Waterfall

You will see a visual tree showing every operation in the request:

```
GET /api/workspaces                     45ms  ██████████████████████████
├── middleware - corsMiddleware           1ms  █
├── middleware - jsonParser               0ms  
├── router - /api/workspaces             44ms  ████████████████████████
│   ├── jwt.verify                        2ms  ██
│   └── mongodb.find                     40ms  ████████████████████
│       └── tcp.connect (pool)            0ms  
└── response.json                         1ms  █
```

**What to look for:**
- The widest bar is the bottleneck — in this project it is almost always the `mongodb.find` span
- Click the `mongodb.find` span → the right panel shows **span attributes** including:
  - `db.statement` — the exact MongoDB query that ran
  - `db.operation` — e.g., `find`
  - `net.peer.name` — the host it connected to

> **The insight:** This is production-grade debugging. Instead of adding `console.log` everywhere and redeploying, you add OTel once and get this level of detail automatically for every request — forever.

---

### Step 5 — Correlate: Trace → Logs (Grafana Loki Link)

Grafana can link a trace directly to the logs that were emitted during that same request:

1. Open a trace in Tempo (from Step 3)
2. In the top-right of the trace panel, click **Logs for this span**
3. Grafana opens the Explore view with a pre-filled LogQL query filtered to the same time window and pod
4. You see the exact log lines from *that specific request*

This is the **metrics → traces → logs** pivot workflow used by SRE teams during incident investigation.

---

**What you proved:**
- OTel auto-instrumentation creates trace spans for HTTP requests, MongoDB queries, and outgoing calls — zero app code changes
- Tempo auto-provisioning via the `grafana_datasource: "1"` label means a fresh cluster is always configured automatically
- Trace waterfalls reveal *where* latency hides — something metrics and logs alone cannot show

---

**Congratulations!** 🎉

You have completed the full Kubernetes + Observability journey:

```
Namespaces → Pods → Deployments → StatefulSets
  → Networking → ConfigMaps → Secrets → Storage
    → Helm packaging → CI/CD automation
      → HPA + PDB reliability
        → Observability (Metrics + Logs + Traces)
          → Load testing under production conditions
```

**Cheatsheet:** [KUBERNETES_GRAFANA_PROMETHEUS_GUIDE.md](../KUBERNETES_GRAFANA_PROMETHEUS_GUIDE.md)
