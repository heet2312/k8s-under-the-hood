/**
 * utils/logger.js
 *
 * Winston-based structured logger.
 * - In production: JSON output (machine-readable for log aggregation tools)
 * - In development: colorized, human-readable console output
 *
 * Using a singleton ensures every module imports the same configured instance.
 */

import winston from 'winston';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

// Custom human-readable format for development
const devFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }), // Log full stack traces on error objects
  printf(({ level, message, timestamp, stack }) => {
    return stack
      ? `${timestamp} [${level}]: ${message}\n${stack}`
      : `${timestamp} [${level}]: ${message}`;
  })
);

// Structured JSON format for production (Datadog, CloudWatch, etc.)
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    // Uncommment below to also write to rotating log files:
    // new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    // new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
  // Prevent Winston from throwing on unhandled exceptions — we handle those separately
  exitOnError: false,
});

export default logger;
