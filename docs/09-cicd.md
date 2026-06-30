# 09 — CI/CD: Automated Deployments

> **Prerequisites:** [Previous Chapter](./08-helm.md)

---

## 🧠 Theory: Continuous Integration & Deployment

If you are manually typing `docker build`, pushing images, and running `kubectl apply`, you do not have a production system. You have a fragile manual script.

A CI/CD pipeline automates this. In this project, we use **GitHub Actions**.

### The Ideal CI/CD Flow for Kubernetes

1. **Commit:** Developer pushes code to the `main` branch.
2. **Build:** The pipeline checks out the code and runs `docker build`.
3. **Push:** The pipeline pushes the built image to a Container Registry (e.g., GitHub Container Registry, Docker Hub, AWS ECR).
4. **Deploy:** The pipeline tells Kubernetes to update the Deployment with the new image.
5. **Rollout:** Kubernetes performs a rolling update (as learned in [01 - Core Workloads](./03-stateless-workloads.md)), ensuring zero downtime.

### Image Tagging Strategy

Notice how we tag the image twice in the pipeline:
1. `taskflow-api:latest`
2. `taskflow-api:${{ github.sha }}`

```
docker build -t ghcr.io/owner/taskflow-api:abcd123 -t ghcr.io/owner/taskflow-api:latest .
```

- **The SHA Tag (`abcd123`):** This guarantees you can tie exactly what code is running in production back to a specific Git commit. If `abcd123` is broken, you know exactly which commit caused it.
- **The Latest Tag (`latest`):** This is a moving pointer. It's convenient for local development (like Minikube) where you just want the newest code without knowing the hash.

### Why `imagePullPolicy: Always` Matters

In our `values.yaml`, we set `imagePullPolicy: Always` for both the API and Web components.

If you don't do this, Kubernetes defaults to `IfNotPresent`. If K8s already has an image cached locally named `taskflow-api:latest`, it will use the cached one, even if you pushed a brand new `latest` to the registry! By forcing `Always`, K8s checks the registry on every pod start, ensuring it pulls the fresh code.

---

## 🔍 In This Project

### 1. The GitHub Actions Workflow
**File:** [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)

```yaml
name: Deploy TaskFlow
on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      packages: write      # Required to push to GHCR
      contents: read
    
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4
        
      - name: Login to GHCR
        run: echo "${{ secrets.GHCR_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
        
      - name: Build and Tag API
        run: |
          docker build \
            -t ghcr.io/${{ github.repository_owner }}/taskflow-api:${{ github.sha }} \
            -t ghcr.io/${{ github.repository_owner }}/taskflow-api:latest \
            ./server
            
      - name: Push API Image
        run: |
          docker push ghcr.io/${{ github.repository_owner }}/taskflow-api:${{ github.sha }}
          docker push ghcr.io/${{ github.repository_owner }}/taskflow-api:latest
```

This workflow automates the **Build** and **Push** steps.

### What about the "Deploy" step?

In a true production environment, the workflow would end with a step that connects to the Kubernetes cluster and updates the image:

```yaml
      # (Example - Not actually in this project's workflow because Minikube is local)
      - name: Deploy to Kubernetes
        run: |
          helm upgrade taskflow ./helm/taskflow \
            --set api.image.tag=${{ github.sha }}
```

Because this project is designed for local learning on Minikube (which the GitHub Action runner cannot access), we simulate the deployment step locally.

---

## 🛠️ Hands-On Challenge

**Goal:** Simulate a CI/CD deployment cycle locally.

```bash
# 1. Verify what image tag is currently running
kubectl describe deployment taskflow-api -n taskflow | grep Image:

# 2. Make a small change to the API code
# Open server/src/index.js
# Change the /api/health response message: res.json({ status: 'ok', version: '2.0' })

# 3. Simulate the CI/CD "Build" step (in Minikube, we load it directly)
eval $(minikube docker-env)  # Point local docker CLI to Minikube's daemon
docker build -t ghcr.io/senghaniheet/taskflow-api:latest ./server

# 4. Simulate the CI/CD "Deploy" step
# Because we are using the 'latest' tag, we force K8s to restart the pods to pull the new 'latest'.
kubectl rollout restart deployment/taskflow-api -n taskflow

# 5. Watch the zero-downtime rolling update
kubectl rollout status deployment/taskflow-api -n taskflow

# 6. Verify the new code is running
curl http://taskflow.local/api/health
# You should see your new version message!
```

**What to notice:**
- By automating the build and using `rollout restart`, K8s handles the difficult part: draining the old pods and safely routing traffic to the new ones without dropping requests.

---

**Next:** [Next Chapter](./10-reliability.md)
