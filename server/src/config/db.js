/**
 * config/db.js
 *
 * Centralizes all MongoDB connection logic.
 * Uses Mongoose's built-in connection pooling and
 * emits structured log events via our Winston logger.
 */

import mongoose from 'mongoose';
import logger from '../utils/logger.js';

// ── Mongoose best-practice settings ─────────────────────────────────────────
// bufferCommands: false  → fail fast if not connected instead of silently queuing
// autoIndex: false (prod) → never auto-build indexes in production;
//                            run manually via migrations for zero-downtime deployments
const CONNECTION_OPTIONS = {
  bufferCommands: false,
  autoIndex: process.env.NODE_ENV !== 'production',
};

/**
 * Establishes a Mongoose connection to MongoDB.
 * Should be called once at server startup.
 */
export const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    logger.error('MONGO_URI is not defined in environment variables.');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri, CONNECTION_OPTIONS);
    logger.info(`MongoDB connected: ${conn.connection.host} (db: ${conn.connection.name})`);
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    process.exit(1); // Exit so the container/orchestrator can restart the process
  }

  // Graceful shutdown — close the Mongoose pool on SIGINT (Ctrl+C)
  mongoose.connection.on('disconnected', () =>
    logger.warn('MongoDB disconnected.')
  );
};

/**
 * Gracefully closes the Mongoose connection.
 * Exported so scripts and tests can call it explicitly.
 */
export const disconnectDB = async () => {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed.');
};
