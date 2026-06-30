# TaskFlow 📋

TaskFlow is a production-grade SaaS Project Management and Task Tracking boilerplate. It provides a robust, highly scalable starting point for building team-based productivity applications, featuring full multi-tenant Workspaces, Projects, and Kanban-style Task tracking.

> 📖 **New to Kubernetes/Grafana/Prometheus?**
> This project comes with a complete learning guide built from this exact setup journey.
> → Read the [**Kubernetes + Grafana + Prometheus Guide**](./KUBERNETES_GRAFANA_PROMETHEUS_GUIDE.md)

---

## 🚀 Tech Stack

**Frontend:**
- **React 18** (Functional Components, Hooks)
- **Vite** (Next-generation lightning-fast bundler)
- **Context API + useReducer** (Redux-pattern global state management)
- **Axios** (Configured with interceptors for auth & error handling)
- **Vanilla CSS Tokens** (Scalable, dynamic design system)

**Backend:**
- **Node.js & Express.js**
- **MongoDB** (Hosted/Containerized)
- **Mongoose ODM** (Strict schemas, validation, pre/post hooks)
- **Winston** (Structured JSON logging for observability)
- **express-validator** (Strict route payload validation)

**Infrastructure:**
- **Docker & Docker Compose** (Local containerized orchestration)
- **Kubernetes + Helm** (Production-grade orchestration)
- **Prometheus + Grafana** (Metrics, dashboards, and alerting)
- **Loki + Promtail** (Log aggregation — structured JSON log shipping from all pods)
- **Grafana Tempo** (Distributed tracing backend)
- **OpenTelemetry SDK** (Auto-instrumented trace & span generation in the Node.js API)
- **GitHub Actions** (CI/CD — build & push to GHCR on every merge to `main`)

---

## 🏗️ Project Structure

```text
├── client/                 # React Frontend
│   ├── src/
│   │   ├── api/            # Centralized Axios setup and resource APIs
│   │   ├── components/     # Reusable UI building blocks (Sidebar, TaskCard, etc.)
│   │   ├── context/        # Global AppContext and reducer
│   │   ├── hooks/          # Custom hooks handling logic & API hydration
│   │   ├── pages/          # Full page views (Board, Dashboard)
│   │   └── index.css       # Token-based CSS Design System
│   ├── Dockerfile          # Multi-stage production frontend container
│   └── nginx.conf          # Nginx production configuration
│
├── server/                 # Express Backend
│   ├── src/
│   │   ├── config/         # DB connection logic setup
│   │   ├── controllers/    # API request handling logic
│   │   ├── middleware/     # Global error catching, validation normalization
│   │   ├── models/         # Mongoose Schemas (Task, Project, Workspace)
│   │   ├── routes/         # Express endpoint definitions
│   │   ├── scripts/        # Standalone operations (migrate.js, seed.js)
│   │   ├── utils/          # Logger, Standard API Responses
│   │   └── instrumentation.js  # OpenTelemetry SDK bootstrap (tracing)
│   ├── tests/load/
│   │   ├── loadtest.js         # k6 load test script (200 VUs, 5 min)
│   │   └── loadtest-pod.yaml   # Kubernetes Pod spec to run k6 inside the cluster
│   └── Dockerfile          # Secure, non-root production Node.js container
│
├── helm/
│   ├── taskflow/           # Custom Helm Chart — deploys the full app stack
│   │   ├── Chart.yaml
│   │   ├── values.yaml
│   │   └── templates/      # Deployment, StatefulSet, HPA, PDB, Ingress, etc.
│   │       └── tempo-datasource.yaml  # Auto-provisions Tempo datasource in Grafana
│   ├── monitoring/         # Helm values for kube-prometheus-stack
│   │   └── values.yaml
│   └── FailureTest/        # YAML examples for failure scenarios (CrashLoopBackOff, etc.)
│
├── monitoring/
│   ├── taskflow-dashboard-import.json       # Grafana metrics dashboard (import)
│   ├── taskflow-backend-observability.json  # Grafana log dashboard with level filter
│   └── prometheus-alert-rule.yaml           # PrometheusRule for CPU/memory alerts
│
├── .github/workflows/
│   └── deploy.yml          # GitHub Actions CI/CD — build & push Docker images
│
├── docker-compose.yml      # Orchestrates all 3 containers locally
└── KUBERNETES_GRAFANA_PROMETHEUS_GUIDE.md  # 📖 Full learning guide
```

---

## ⚙️ Getting Started

### Method A: Docker Compose (Recommended for local dev)

1. Make sure [Docker Desktop](https://www.docker.com/products/docker-desktop/) is running.
2. At the root of the project, run:
```bash
docker compose up --build
```
3. This spins up 3 containers: `taskflow_mongo` (27017), `taskflow_server` (5000), and `taskflow_client` (Nginx on port 3000).
4. Open `http://localhost:3000`. All `/api/*` requests are reverse-proxied by Nginx to the backend automatically.

*(MongoDB data persists across restarts via Docker volumes)*

### Method B: Manual Setup (NPM)

**Requirements:** MongoDB must be running locally at `mongodb://localhost:27017`.

**1. Backend:**
```bash
cd server
npm install
cp .env.example .env
npm run dev
```

**2. Frontend:**
```bash
cd client
npm install
npm run dev
```

---

## 🗄️ Database Management & Seeding

Run these from the `server/` directory:

```bash
# Apply indexes and schema migrations
npm run migrate

# Drop all data and seed with realistic test data
npm run seed

# Run both in sequence (great for fresh environments)
npm run migrate:seed
```

> **Warning:** `npm run seed` drops entire collections. It won't run if `NODE_ENV=production`.

---

## ☸️ Kubernetes Deployment (Full Setup)

> 📖 **Learn the concepts first:** [00 — Introduction](./docs/00-introduction.md) | [05 — Helm](./docs/05-helm.md)

### Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Build images | Required |
| [Minikube](https://minikube.sigs.k8s.io/docs/start/) | Local K8s cluster | `winget install Kubernetes.minikube` |
| [kubectl](https://kubernetes.io/docs/tasks/tools/) | Cluster CLI | Bundled with Docker Desktop |
| [Helm v3+](https://helm.sh/docs/intro/install/) | Package manager for K8s | `winget install Helm.Helm` |

### Step 1 — Start Minikube

> 📖 [Full Minikube setup guide](./docs/00-introduction.md#🖥️-minikube-local-k8s-cluster)

```bash
# Start with enough resources for the monitoring stack
minikube start --cpus=4 --memory=6144

# Enable required addons
minikube addons enable ingress         # Nginx Ingress Controller
minikube addons enable metrics-server  # Required for HPA (CPU/memory autoscaling)

# Verify everything is up
minikube status
kubectl get nodes
```

### Step 2 — Build & Load Docker Images

```bash
# Build the API image
docker build -t ghcr.io/senghaniheet/taskflow-api:latest ./server

# Build the Web image
docker build -t ghcr.io/senghaniheet/taskflow-web:latest ./client

# Load images into Minikube (skips registry push for local dev)
minikube image load ghcr.io/senghaniheet/taskflow-api:latest
minikube image load ghcr.io/senghaniheet/taskflow-web:latest
```

### Step 3 — Deploy with Helm

> 📖 [Helm commands reference](./docs/05-helm.md#key-helm-commands)

```bash
# Install the full app stack into the 'taskflow' namespace
helm install taskflow ./helm/taskflow \
  --namespace taskflow \
  --create-namespace \
  --set api.image.pullPolicy=Never \
  --set web.image.pullPolicy=Never

# Watch pods come up
kubectl get pods -n taskflow -w
```

All pods should reach `Running` status within ~60 seconds.

### Step 4 — Configure Local Ingress

```bash
# Get the Minikube IP
minikube ip
# Example output: 192.168.49.2
```

Add this line to your hosts file (`C:\Windows\System32\drivers\etc\hosts` on Windows):
```
192.168.49.2  taskflow.local
```

Now open `http://taskflow.local` in your browser.

### Step 5 — Verify the Deployment

```bash
# All pods running?
kubectl get pods -n taskflow

# Services exposed?
kubectl get svc -n taskflow

# Ingress routing?
kubectl get ingress -n taskflow

# HPA configured?
kubectl get hpa -n taskflow

# Check logs for any issues
kubectl logs -l app=api -n taskflow --tail=50
```

### Helm Operations Reference

```bash
# Apply changes after editing values.yaml
helm upgrade taskflow ./helm/taskflow --namespace taskflow

# Rolling restart (force pods to pull new image)
kubectl rollout restart deployment/taskflow-api -n taskflow

# Teardown everything
helm uninstall taskflow --namespace taskflow
```

---

## 📊 Monitoring Setup (Prometheus + Grafana + Loki + Tempo)

> 📖 [Prometheus & Metrics](./docs/10-metrics.md) | [Loki & Logs](./docs/11-logging.md) | [Tempo & Tracing](./docs/12-tracing.md)

### Step 1 — Install kube-prometheus-stack

```bash
# Add the Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install Prometheus + Grafana + Alertmanager + exporters
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  -f ./helm/monitoring/values.yaml

# Wait for all pods to be ready (~2-3 minutes)
kubectl get pods -n monitoring -w
```

### Step 2 — Install Loki (Log Aggregation)

```bash
# Add Grafana Helm repo
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Install Loki + Promtail (ships pod logs to Loki automatically)
helm install loki-stack grafana/loki-stack \
  --namespace monitoring \
  --set promtail.enabled=true \
  --set loki.enabled=true

# Verify
kubectl get pods -n monitoring | grep loki
```

Access Loki directly (for API testing):
```bash
kubectl port-forward svc/loki-stack -n monitoring 3100:3100
```

### Step 3 — Install Grafana Tempo (Distributed Tracing)

```bash
# Install Tempo in single-binary mode
helm install tempo grafana/tempo \
  --namespace monitoring

# Verify Tempo is running
kubectl get pods -n monitoring | grep tempo
```

Tempo is automatically provisioned as a Grafana datasource via the `taskflow-tempo-datasource` ConfigMap deployed by the Helm chart.

### Step 4 — Access Prometheus

```bash
kubectl port-forward svc/monitoring-kube-prometheus-prometheus -n monitoring 9090:9090
```

Open `http://localhost:9090` → Go to **Graph** tab to run PromQL queries.

```promql
# Are TaskFlow pods visible?
kube_pod_info{namespace="taskflow"}

# API pod CPU usage
sum(rate(container_cpu_usage_seconds_total{namespace="taskflow", container="api"}[5m])) by (pod)

# API pod memory usage (MiB)
container_memory_working_set_bytes{namespace="taskflow", container="api"} / 1024 / 1024
```

### Step 5 — Access Grafana

```bash
kubectl port-forward svc/monitoring-grafana -n monitoring 8080:80
```

**Get the admin password (PowerShell):**
```powershell
$encoded = kubectl get secret monitoring-grafana -n monitoring -o jsonpath="{.data.admin-password}"
[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($encoded))
```

Login at `http://localhost:8080` → Username: `admin`

### Step 6 — Import the TaskFlow Dashboards

**Metrics Dashboard:**
1. In Grafana, go to **Dashboards → Import**
2. Click **Upload JSON file** → Select `monitoring/taskflow-dashboard-import.json`
3. Select the **Prometheus** data source → **Import**

The dashboard includes:
- 📦 **Overview** — Live pod counts (API, Web, MongoDB, Total)
- 🎯 **Desired Pods** — HPA desired vs actual replica tracking
- ⚡ **CPU & Autoscaling** — Per-pod CPU, HPA scale events, utilization %
- 🧠 **Memory** — Per-pod memory usage, leak detection trend

**Log Dashboard (Loki):**
1. Import `monitoring/taskflow-backend-observability.json`
2. This dashboard provides a unified log view across all pods with:
   - **Namespace** and **Container** dropdown filters
   - **Log Level** filter (`http`, `info`, `warn`, `error`) — intelligently parses both structured JSON API logs and plain Nginx access logs

### Step 7 — Apply Alert Rules

```bash
kubectl apply -f monitoring/prometheus-alert-rule.yaml
kubectl get prometheusrule -n monitoring
```

Check active alerts at `http://localhost:9090/alerts`.

---

## 🔗 Distributed Tracing (OpenTelemetry + Grafana Tempo)

> 📖 [Distributed Tracing Guide](./docs/12-tracing.md)

The Node.js API is fully instrumented with OpenTelemetry auto-instrumentation. Every HTTP request and MongoDB query generates a **trace** that is exported to Grafana Tempo via OTLP gRPC.

### Architecture
```
Node.js API (Express + Mongoose)
      ↓
OpenTelemetry SDK (auto-instrumentation)
      ↓  gRPC port 4317
Grafana Tempo  (tempo.monitoring.svc.cluster.local)
      ↓
Grafana Explore  →  Search by Service: taskflow-api
```

### How It Works
- [`server/src/instrumentation.js`](./server/src/instrumentation.js) initialises the `NodeSDK` with the OTLP gRPC exporter.
- It is loaded as an **ESM hook** via `NODE_OPTIONS=--import ./src/instrumentation.js` injected by the Helm ConfigMap.
- Every log line in the API now includes `trace_id` and `span_id` fields — allowing you to jump from a Loki log entry directly to the corresponding Tempo trace.

### Explore Traces in Grafana

1. Go to `http://localhost:8080/explore`
2. Select the **Tempo** datasource
3. Search by **Service Name**: `taskflow-api`
4. Click any `trace_id` to see the full span waterfall (HTTP → MongoDB)

### Key Environment Variables

| Variable | Value |
|----------|-------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://tempo.monitoring.svc.cluster.local:4317` |
| `OTEL_SERVICE_NAME` | `taskflow-api` |
| `NODE_OPTIONS` | `--import ./src/instrumentation.js` |

---

## ⚡ Autoscaling (HPA)

> 📖 [HPA deep dive](./docs/07-reliability.md#hpa-—-horizontal-pod-autoscaler)

The API and Web services both have Horizontal Pod Autoscalers configured in [`helm/taskflow/values.yaml`](./helm/taskflow/values.yaml):

| Service | Min Pods | Max Pods | CPU Target | Memory Target |
|---------|---------|---------|-----------|--------------|
| API | 3 | 10 | 60% | 80% |
| Web | 1 | 10 | 80% | 80% |

**Watch HPA in action:**
```bash
kubectl get hpa -n taskflow -w
```

**Trigger autoscaling with the k6 load test pod:**

> 📖 [Load testing guide](./docs/09-load-testing.md)

```bash
# Create the loadtest ConfigMap (first time only)
kubectl create configmap loadtest-config \
  --from-file=loadtest.js=server/tests/load/loadtest.js \
  -n taskflow

# Launch the k6 load test pod (200 VUs, 5 minutes)
kubectl apply -f server/tests/load/loadtest-pod.yaml

# Watch k6 progress
kubectl logs k6-load-generator -n taskflow -f

# Watch pods scale up in a separate terminal
kubectl get hpa -n taskflow -w

# Clean up when done
kubectl delete pod k6-load-generator -n taskflow
```

The k6 load test targets these endpoints with randomised traffic:
- **40%** — `GET /api/workspaces` (DB read)
- **30%** — `GET /api/tasks` (DB read with filter)
- **20%** — `GET /api/health` (lightweight health check)
- **10%** — `POST /api/workspaces` (DB write)

---

## 🛡️ Reliability Features

> 📖 [Pod Disruption Budgets](./docs/07-reliability.md#pdb-—-pod-disruption-budget)

| Feature | Details |
|---------|---------|
| **Rolling Updates** | `maxUnavailable: 0` — zero downtime deploys |
| **Pod Disruption Budgets** | `maxUnavailable: 1` — at least N-1 pods always available |
| **Liveness Probes** | Auto-restart unhealthy pods via `/api/health` |
| **Readiness Probes** | Traffic only routes to ready pods |
| **Persistent Storage** | MongoDB data survives pod restarts via PVC |

---

## 🚢 CI/CD Pipeline

> 📖 [CI/CD with GitHub Actions](./docs/06-cicd.md)

On every push to `main`, GitHub Actions automatically:

1. Builds the API Docker image → tags with `latest` + commit SHA
2. Builds the Web Docker image → tags with `latest` + commit SHA
3. Pushes both images to **GHCR** (GitHub Container Registry)

**Required GitHub Secret:**
- `GHCR_TOKEN` — a Personal Access Token with `write:packages` scope

**Apply new images to the cluster:**
```bash
kubectl rollout restart deployment/taskflow-api -n taskflow
kubectl rollout restart deployment/taskflow-web -n taskflow

# Watch the rollout
kubectl rollout status deployment/taskflow-api -n taskflow
```

---

## 🛡️ Architecture & Design Principles

### Backend
- **Envelope API Responses**: Every API returns `{ success, statusCode, message, data }`.
- **Global Error Handling**: Unhandled exceptions and `ApiError` throws are caught by final middleware, returning consistent 4xx/5xx payloads.
- **Relational Integrity**: Workspaces → Projects → Tasks linked via `ObjectId` with `.populate()` chains for denormalized views in one request.

### Frontend
- **Stable Dispatch Pattern**: Context API uses a stable `useCallback` `dispatch` to prevent unnecessary re-renders.
- **Hook-Driven Data**: Custom hooks like `useTasks()` own all API logic, keeping layout components clean.
- **Aesthetics First**: Ground-up `index.css` using CSS color-mixing variables and fluid shadows.

---

## 🧪 Testing

> **Tip:** Tests are fully isolated. No database setup needed.

### Backend (Jest + Supertest + mongodb-memory-server)
```bash
cd server
npm run test
```

### Frontend (Vitest + React Testing Library)
```bash
cd client
npm run test
```

---

## 🌍 Environment Variables Reference

### Server (API)

| Variable | Required | Default | Description |
|----------|---------|---------|-------------|
| `NODE_ENV` | ✅ | — | `production` / `development` |
| `PORT` | — | `5000` | API server port |
| `MONGO_URI` | ✅ | — | MongoDB connection string |
| `JWT_SECRET` | ✅ | — | Cryptographically secure random string |
| `JWT_EXPIRES_IN` | — | `1d` | Token expiry (e.g. `7d`, `24h`) |
| `ALLOWED_ORIGINS` | ✅ | — | CORS whitelist (comma-separated URLs) |
| `NODE_OPTIONS` | — | — | Set to `--import ./src/instrumentation.js` to enable OpenTelemetry tracing |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | — | gRPC endpoint for Tempo (e.g. `http://tempo.monitoring.svc.cluster.local:4317`) |
| `OTEL_SERVICE_NAME` | — | — | Service name tag for traces (e.g. `taskflow-api`) |
| `LOG_LEVEL` | — | `info` | Winston log level (`http`, `info`, `warn`, `error`) |

### Client (React / Vite)

| Variable | Required | Description |
|----------|---------|-------------|
| `VITE_API_URL` | — | Full API URL if not using Nginx proxy (e.g. `https://api.yourdomain.com/api`) |

> In Kubernetes/Docker setups, Nginx automatically proxies `/api/*` to the backend — `VITE_API_URL` can be omitted.

---

## 📚 Learning Resources

| Topic | Link |
|-------|------|
| Full Curriculum Index | [KUBERNETES_GRAFANA_PROMETHEUS_GUIDE.md](./KUBERNETES_GRAFANA_PROMETHEUS_GUIDE.md) |
| 00 — Introduction: Docker → Kubernetes | [docs/00-introduction.md](./docs/00-introduction.md) |
| 01 — Core Workloads: Pods, Deployments, StatefulSets | [docs/01-core-workloads.md](./docs/01-core-workloads.md) |
| 02 — Networking: Services, Ingress, and DNS | [docs/02-networking.md](./docs/02-networking.md) |
| 03 — Configuration: ConfigMaps and Secrets | [docs/03-configuration.md](./docs/03-configuration.md) |
| 04 — Storage: PV, PVC, and StorageClass | [docs/04-storage.md](./docs/04-storage.md) |
| 05 — Helm: The Package Manager for Kubernetes | [docs/05-helm.md](./docs/05-helm.md) |
| 06 — CI/CD: Automated Deployments | [docs/06-cicd.md](./docs/06-cicd.md) |
| 07 — Reliability: HPA, PDB, Resource Limits | [docs/07-reliability.md](./docs/07-reliability.md) |
| 08 — Observability Architecture: The Three Pillars | [docs/08-observability-arch.md](./docs/08-observability-arch.md) |
| 09 — Load Testing: Validating Autoscaling | [docs/09-load-testing.md](./docs/09-load-testing.md) |
| 10 — Metrics: Prometheus and PromQL | [docs/10-metrics.md](./docs/10-metrics.md) |
| 11 — Logging: Loki, Promtail, and LogQL | [docs/11-logging.md](./docs/11-logging.md) |
| 12 — Distributed Tracing: OpenTelemetry and Tempo | [docs/12-tracing.md](./docs/12-tracing.md) |
| Raw YAML Examples | [k8s-scripts/](./k8s-scripts/) |

---

## 📝 License

MIT License — Free to use and scale!
  