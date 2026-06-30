# ─────────────────────────────────────────────────────────
# Stage 1: Build stage
# ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for dependency caching
COPY package*.json ./

# Install all dependencies (clean install) for building the client
RUN npm ci

# Copy the rest of the frontend source code
COPY . .

# Build the Vite application for production (generates /app/dist)
RUN npm run build

# ─────────────────────────────────────────────────────────
# Stage 2: Production server stage
# ─────────────────────────────────────────────────────────
FROM nginx:stable-alpine

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy build artifacts from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80 for traffic
EXPOSE 80

# Start Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
