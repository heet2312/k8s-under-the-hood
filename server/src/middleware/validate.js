/**
 * middleware/validate.js
 *
 * Reusable Express middleware that reads validation results produced by
 * express-validator and sends a structured 422 response if any rules failed.
 *
 * Usage (in a router file):
 *   import { body } from 'express-validator';
 *   import validate from '../middleware/validate.js';
 *
 *   router.post('/', [
 *     body('title').notEmpty().trim(),
 *     body('priority').isIn(['Low', 'Medium', 'High']),
 *     validate,
 *   ], taskController.createTask);
 */

import { validationResult } from 'express-validator';

const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      statusCode: 422,
      message: 'Validation failed.',
      errors: errors.array().map((e) => ({
        field: e.path,
        message: e.msg,
        value: e.value,
      })),
    });
  }

  next();
};

export default validate;
