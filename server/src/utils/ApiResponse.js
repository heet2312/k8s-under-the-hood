/**
 * utils/ApiError.js
 *
 * Custom error class for operational (expected) API errors.
 * Extends the native Error so it carries an HTTP status code
 * and a structured payload consumable by the global error handler.
 *
 * Usage:
 *   throw new ApiError(404, 'Task not found');
 *   throw new ApiError(400, 'Validation failed', ['email is required']);
 */
export class ApiError extends Error {
  /**
   * @param {number} statusCode - HTTP status code (e.g. 400, 401, 404, 500)
   * @param {string} message    - Human-readable error message
   * @param {Array}  [errors]   - Optional array of field-level validation errors
   */
  constructor(statusCode, message, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true; // Flag to distinguish from programmer errors

    // Capture V8 stack trace, excluding the constructor frame
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * utils/ApiResponse.js
 *
 * Standardizes all successful API responses.
 * Every endpoint returns the same envelope shape so clients
 * can reliably destructure { success, data, message, ... }.
 *
 * Usage:
 *   res.status(200).json(new ApiResponse(200, taskList, 'Tasks fetched successfully'));
 */
export class ApiResponse {
  /**
   * @param {number} statusCode - HTTP status code
   * @param {*}      data       - The response payload
   * @param {string} message    - Human-readable success message
   */
  constructor(statusCode, data, message = 'Success') {
    this.success = statusCode < 400;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
  }
}
