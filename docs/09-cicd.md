# 09 — CI/CD: Automated Deployments & Private GHCR Packages

> **Prerequisites:** [08 — Helm](./08-helm.md)

---

## 🧠 Theory: Continuous Integration & Deployment

If you are manually typing `docker build`, pushing images, and running `kubectl apply`, you do not have a production system. You have a fragile manual script.

A CI/CD pipeline automates this. In this project, we use **GitHub Actions** to build, tag, and publish Docker images as **private packages** to the GitHub Container Registry (GHCR).

### The CI/CD Flow in This Project

```
Developer pushes code
        ↓
GitHub Actions triggers
        ↓
  docker build (API + Web)
        ↓
  docker push → ghcr.io (private packages, v1.0.0 / v1.0.1 / latest)
        ↓
  GitHub API → enforce visibility = private
        ↓
Kubernetes pulls the image using an imagePullSecret
```

### Semver Image Tagging Strategy

When you push a Git tag (e.g. `v1.0.0`), the pipeline publishes three tags automatically:

| Tag | Purpose |
|-----|---------|
| `v1.0.0` | Exact version — pin this in deployments |
| `v1.0` | Minor family — tracks latest patch |
| `v1` | Major family — tracks latest minor |
| `latest` | Convenience pointer (main branch only) |

This is what makes deployment strategies easy — to roll from `v1.0.0` → `v1.0.1`:

```bash
helm upgrade taskflow ./helm/taskflow \
  --set api.image.tag=v1.0.1 \
  --set web.image.tag=v1.0.1
```

---

## 🔑 Step 1 — Create a Personal Access Token (PAT)

A **Personal Access Token (PAT)** is a key that lets both the CI pipeline and Kubernetes authenticate to your **private** GHCR packages.

### Generate the token

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**  
   Direct link: `https://github.com/settings/tokens/new`

2. Fill in:
   - **Note:** `taskflow-ghcr`
   - **Expiration:** 90 days (or No expiration for local use)
   - **Scopes — select these three:**
     - ✅ `write:packages` — push images from CI
     - ✅ `read:packages` — pull images into Kubernetes
     - ✅ `delete:packages` — clean up old versions (optional)

3. Click **Generate token** and **copy it immediately** — GitHub shows it only once.

```
ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
         ↑ your token looks like this
```

> [!CAUTION]
> Treat this token like a password. Never commit it to Git, never paste it in plain text anywhere.

---

## 🔐 Step 2 — Add the Token as a GitHub Actions Secret

The CI pipeline reads the token from a secret named `GHCR_TOKEN`.

1. Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**
2. Set:
   - **Name:** `GHCR_TOKEN`
   - **Secret:** paste your PAT
3. Click **Add secret**

The workflow references it as `${{ secrets.GHCR_TOKEN }}` — it is never exposed in logs.

---

## 🐳 Step 3 — Create a Kubernetes imagePullSecret

Kubernetes needs the same token to pull private images from GHCR onto your nodes.

### Create the secret with kubectl (recommended)

```bash
kubectl create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=<YOUR_GITHUB_USERNAME> \
  --docker-password=<YOUR_GHCR_TOKEN> \
  --docker-email=<YOUR_GITHUB_EMAIL> \
  --namespace=taskflow
```

> Replace `<YOUR_GITHUB_USERNAME>`, `<YOUR_GHCR_TOKEN>`, and `<YOUR_GITHUB_EMAIL>` with your actual values.

### Verify the secret was created

```bash
kubectl get secret ghcr-pull-secret -n taskflow
# NAME                TYPE                             DATA   AGE
# ghcr-pull-secret    kubernetes.io/dockerconfigjson   1      5s
```

### The secret is already wired into the Deployment

The Deployment manifest at [`k8s-scripts/02-deployment.yaml`](../k8s-scripts/02-deployment.yaml) already references it:

```yaml
spec:
  imagePullSecrets:
    - name: ghcr-pull-secret   # ← this
  containers:
    - name: api
      image: ghcr.io/senghaniheet/taskflow-api:v1.0.0   # ⚠️ replace senghaniheet with YOUR username
```

Kubernetes will automatically use this secret when pulling any `ghcr.io` image.

---

## 📦 Step 4 — Publish Images via Git Tag

```bash
# Tag the current commit as v1.0.0
git tag v1.0.0
git push origin v1.0.0

# CI will build and push:
#   ghcr.io/senghaniheet/taskflow-api:v1.0.0
#   ghcr.io/senghaniheet/taskflow-api:v1.0
#   ghcr.io/senghaniheet/taskflow-api:v1
#   ghcr.io/senghaniheet/taskflow-api:latest (because it's on main)
#   (same for taskflow-web)
#
# Then the pipeline automatically calls the GitHub API
# to enforce private visibility on both packages.
```

---

## 🛠️ Try It: Full Deployment Cycle

```bash
# 1. Make sure the namespace and imagePullSecret exist
kubectl apply -f k8s-scripts/00-namespace.yaml
kubectl create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=senghaniheet \
  --docker-password=<YOUR_PAT> \
  --docker-email=<YOUR_EMAIL> \
  --namespace=taskflow

# 2. Apply all resources
kubectl apply -f k8s-scripts/07-configmap.yaml
kubectl apply -f k8s-scripts/08-secret.yaml
kubectl apply -f k8s-scripts/02-deployment.yaml

# 3. Watch pods pull the private image and start
kubectl get pods -n taskflow -w
# Should show: Pending → ContainerCreating → Running

# 4. Simulate releasing v1.0.1 — bump the tag and push
git tag v1.0.1
git push origin v1.0.1

# 5. After CI runs, deploy the new version (zero-downtime rolling update)
helm upgrade taskflow ./helm/taskflow \
  --set api.image.tag=v1.0.1 \
  --set web.image.tag=v1.0.1

# 6. Watch the rolling update
kubectl rollout status deployment/taskflow-api -n taskflow

# 7. Roll back to v1.0.0 if something is wrong
helm upgrade taskflow ./helm/taskflow \
  --set api.image.tag=v1.0.0 \
  --set web.image.tag=v1.0.0
```

> [!NOTE]
> The `imagePullSecret` only needs to be created **once per namespace**. You don't need to re-create it on every deploy.

---

## 🔍 Reference: Files Changed in This Chapter

| File | What it does |
|------|-------------|
| [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) | Builds images, pushes to GHCR, enforces private visibility |
| [`k8s-scripts/09-ghcr-secret.yaml`](../k8s-scripts/09-ghcr-secret.yaml) | Reference manifest for the imagePullSecret (use kubectl command above instead) |
| [`k8s-scripts/02-deployment.yaml`](../k8s-scripts/02-deployment.yaml) | References `ghcr-pull-secret` via `imagePullSecrets` |
| [`helm/taskflow/values.yaml`](../helm/taskflow/values.yaml) | Sets image tags to `v1.0.0` for both API and Web |

---

**Next:** [10 — Reliability →](./10-reliability.md)
