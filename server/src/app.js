/**
 * app.js
 *
 * Pure Express application factory — no server.listen() here.
 * Separating the app from the server entry (index.js) makes it trivially
 * testable: tests can import this module and call supertest(app) without
 * actually binding to a port.
 *
 * Middleware stack (order is intentional):
 *   1. helmet        → security headers
 *   2. cors          → cross-origin resource sharing
 *   3. compression   → gzip responses
 *   4. morgan        → HTTP access logging
 *   5. express.json  → body parsing
 *   6. rateLimit     → brute-force protection
 *   --- routes ---
 *   7. 404 handler   → unmatched routes
 *   8. errorHandler  → global async/Mongoose error normalization
 */

import 'express-async-errors'; // Patches Express to forward async rejections to next(err)
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import promClient from 'prom-client';

import workspaceRoutes from './routes/workspaceRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import errorHandler from './middleware/errorHandler.js';
import logger from './utils/logger.js';

const app = express();

// ── Metrics ───────────────────────────────────────────────────────────────────
promClient.collectDefaultMetrics();

const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

app.use((req, res, next) => {
  const start = process.hrtime();
  res.on('finish', () => {
    if (req.path !== '/api/metrics' && req.path !== '/api/health') {
      const diff = process.hrtime(start);
      const durationSeconds = diff[0] + diff[1] / 1e9;
      const route = req.route ? req.baseUrl + req.route.path : req.path;
      httpRequestDurationMicroseconds
        .labels(req.method, route, res.statusCode)
        .observe(durationSeconds);
    }
  });
  next();
});

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet()); // Sets security-related HTTP headers (CSP, HSTS, X-Frame, etc.)

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no origin header) or whitelisted origins
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS policy: origin '${origin}' is not allowed.`));
    },
    credentials: true, // Allow cookies / Authorization headers
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  })
);

// ── Compression ───────────────────────────────────────────────────────────────
app.use(compression());

// ── HTTP Request Logging ──────────────────────────────────────────────────────
// Use 'combined' in production (Apache log format), 'dev' for colorized local output
const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(
  morgan(morganFormat, {
    stream: { write: (msg) => logger.http(msg.trim()) },
    // Skip health-check requests from logs to reduce noise
    skip: (req) => req.path === '/api/health',
  })
);

// ── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));          // JSON bodies
app.use(express.urlencoded({ extended: true }));  // Form-encoded bodies

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 200,                  // Max 200 requests per window per IP
  standardHeaders: true,     // Return RateLimit-* headers (RFC 6585)
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});
if (process.env.DISABLE_RATE_LIMIT !== 'true') {
  app.use('/api', limiter);
}

// ── Temp Memory Leak Endpoint ────────────────────────────────────────────────
const leak = [];
app.get('/api/leak', (req, res) => {
  logger.warn('Memory leak triggered manually!');
  setInterval(() => {
    leak.push(crypto.randomBytes(1024 * 1024));
  }, 1000);
  res.status(200).json({ success: true, message: 'Memory leak started' });
});

// ── Metrics Endpoint ──────────────────────────────────────────────────────────
app.get('/api/metrics', async (req, res) => {
  try {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
  } catch (ex) {
    res.status(500).end(ex.message);
  }
});

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: `Route '${req.method} ${req.originalUrl}' not found.`,
  });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
// Must be registered LAST — Express identifies error middleware by its 4-arg signature
app.use(errorHandler);

export default app;
