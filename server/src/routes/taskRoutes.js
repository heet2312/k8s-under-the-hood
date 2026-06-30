/**
 * routes/taskRoutes.js
 *
 * Defines all HTTP endpoints for the Task resource.
 * Each route is protected by express-validator rules + the validate middleware,
 * keeping validation logic OUT of the controller (Single Responsibility Principle).
 *
 * Route summary:
 *   GET    /api/tasks          → list tasks for a project (paginated, filtered)
 *   POST   /api/tasks          → create a new task
 *   GET    /api/tasks/:id      → get one task (deeply populated)
 *   PATCH  /api/tasks/:id      → partial update
 *   DELETE /api/tasks/:id      → soft-delete
 *   PATCH  /api/tasks/:id/restore → restore soft-deleted task
 */

import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  getTasksByProject,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  restoreTask,
} from '../controllers/taskController.js';
import { TASK_STATUS, TASK_PRIORITY } from '../models/Task.js';
import validate from '../middleware/validate.js';

const router = Router();

// ── Shared validators ─────────────────────────────────────────────────────────
const validStatuses = Object.values(TASK_STATUS);
const validPriorities = Object.values(TASK_PRIORITY);

const idParamValidator = param('id')
  .isMongoId()
  .withMessage('Task id must be a valid MongoDB ObjectId.');

// ── Routes ────────────────────────────────────────────────────────────────────

router.get(
  '/',
  [
    query('project').isMongoId().withMessage('"project" must be a valid MongoDB ObjectId.'),
    query('status').optional().isIn(validStatuses).withMessage(`Status must be one of: ${validStatuses.join(', ')}.`),
    query('priority').optional().isIn(validPriorities).withMessage(`Priority must be one of: ${validPriorities.join(', ')}.`),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.').toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.').toInt(),
    validate,
  ],
  getTasksByProject
);

router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Title is required.').isLength({ max: 200 }),
    body('project').isMongoId().withMessage('"project" must be a valid MongoDB ObjectId.'),
    body('status').optional().isIn(validStatuses),
    body('priority').optional().isIn(validPriorities),
    body('assignedTo').optional().isEmail().withMessage('assignedTo must be a valid email.').normalizeEmail(),
    body('dueDate').optional({ nullable: true }).isISO8601().withMessage('dueDate must be a valid ISO 8601 date.'),
    body('estimatedHours').optional({ nullable: true }).isFloat({ min: 0 }),
    body('labels').optional().isArray(),
    validate,
  ],
  createTask
);

router.get('/:id', [idParamValidator, validate], getTaskById);

router.patch(
  '/:id',
  [
    idParamValidator,
    body('title').optional().trim().notEmpty().isLength({ max: 200 }),
    body('status').optional().isIn(validStatuses),
    body('priority').optional().isIn(validPriorities),
    body('assignedTo').optional({ nullable: true }).isEmail().normalizeEmail(),
    body('dueDate').optional({ nullable: true }).isISO8601(),
    body('estimatedHours').optional({ nullable: true }).isFloat({ min: 0 }),
    body('loggedHours').optional().isFloat({ min: 0 }),
    body('labels').optional().isArray(),
    validate,
  ],
  updateTask
);

router.delete('/:id', [idParamValidator, validate], deleteTask);

router.patch('/:id/restore', [idParamValidator, validate], restoreTask);

export default router;
