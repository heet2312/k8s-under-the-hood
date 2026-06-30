/**
 * src/index.js
 *
 * Server entry point — the ONLY file responsible for:
 *   1. Loading environment variables (.env)
 *   2. Connecting to the database
 *   3. Binding the Express app to a port
 *   4. Registering process signal handlers for graceful shutdown
 *
 * Graceful shutdown pattern:
 *   When the process receives SIGTERM/SIGINT (e.g., Docker stop, Ctrl+C),
 *   we stop accepting new connections, wait for in-flight requests to finish,
 *   then close the DB connection before exiting.
 *   This prevents request drops and data corruption in production.
 */

import 'dotenv/config';   // Loads .env into process.env BEFORE any other imports
import http from 'http';
import app from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import logger from './utils/logger.js';

const PORT = process.env.PORT || 5000;

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const bootstrap = async () => {
  // Connect to MongoDB first — fail fast if unavailable
  await connectDB();

  const server = http.createServer(app);

  server.listen(PORT, () => {
    logger.info(`🚀 TaskFlow API running on http://localhost:${PORT} [${process.env.NODE_ENV}]`);
  });

  // ── Graceful Shutdown ───────────────────────────────────────────────────────
  const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received. Initiating graceful shutdown...`);

    // Stop the HTTP server from accepting new connections
    server.close(async () => {
      logger.info('HTTP server closed. No new connections accepted.');
      try {
        await disconnectDB();
        logger.info('Graceful shutdown complete. Exiting.');
        process.exit(0);
      } catch (err) {
        logger.error(`Error during shutdown: ${err.message}`);
        process.exit(1);
      }
    });

    // Force-kill after 10 seconds if shutdown hangs (e.g., stuck DB query)
    setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Docker / k8s sends SIGTERM
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C in development

  // ── Unhandled Rejection / Exception Handlers ────────────────────────────────
  // These are last-resort safety nets. Operational errors should never reach here.
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled Promise Rejection: ${reason}`);
    gracefulShutdown('unhandledRejection');
  });

  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.message}`);
    gracefulShutdown('uncaughtException');
  });
};

bootstrap();
