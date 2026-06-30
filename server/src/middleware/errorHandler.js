/**
 * middleware/errorHandler.js
 *
 * Global Express error-handling middleware.
 * Must be registered LAST (after all routes) in app.js.
 *
 * Design decisions:
 * - Distinguishes between "operational" errors (ApiError — expected, safe to surface)
 *   and programmer/unexpected errors (generic 500, message hidden in production).
 * - Mongoose validation errors and CastErrors are caught and normalized here
 *   so controllers never need to handle them.
 * - All errors are logged via Winston for observability.
 */

import { ApiError } from '../utils/ApiResponse.js';
import logger from '../utils/logger.js';

/**
 * Converts Mongoose-specific errors into our ApiError format.
 * @param {Error} err - The raw Mongoose error
 * @returns {ApiError}
 */
const normalizeMongooseError = (err) => {
  // CastError: invalid ObjectId format (e.g., /api/tasks/not-an-id)
  if (err.name === 'CastError') {
    return new ApiError(400, `Invalid value for field '${err.path}': ${err.value}`);
  }

  // Mongoose ValidationError: schema-level validation failures
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return new ApiError(422, 'Validation failed.', messages);
  }

  // MongoDB duplicate key error (E11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return new ApiError(409, `Duplicate value: '${err.keyValue?.[field]}' already exists for field '${field}'.`);
  }

  return null; // Not a known Mongoose error
};

/**
 * The global Express error handler (4 arguments = error middleware).
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Try to normalize Mongoose errors first
  const normalizedError = normalizeMongooseError(err);
  if (normalizedError) {
    return res.status(normalizedError.statusCode).json({
      success: false,
      statusCode: normalizedError.statusCode,
      message: normalizedError.message,
      errors: normalizedError.errors,
    });
  }

  // Operational errors (ApiError instances) — safe to expose details
  if (err instanceof ApiError && err.isOperational) {
    logger.warn(`Operational error [${err.statusCode}]: ${err.message}`);
    return res.status(err.statusCode).json({
      success: false,
      statusCode: err.statusCode,
      message: err.message,
      errors: err.errors,
    });
  }

  // Unexpected/programmer errors — log full details, hide from client in production
  logger.error('Unexpected error:', err);

  return res.status(500).json({
    success: false,
    statusCode: 500,
    message:
      process.env.NODE_ENV === 'production'
        ? 'An unexpected internal error occurred.'
        : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

export default errorHandler;
