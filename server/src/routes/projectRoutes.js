/**
 * routes/projectRoutes.js
 *
 * Route summary:
 *   GET    /api/projects?workspace=<id>   → list projects in a workspace
 *   POST   /api/projects                  → create project
 *   GET    /api/projects/:id              → get one project (populated)
 *   PATCH  /api/projects/:id              → partial update
 *   DELETE /api/projects/:id              → soft-delete (cascades to tasks)
 */

import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  getProjectsByWorkspace,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
} from '../controllers/projectController.js';
import { PROJECT_STATUS } from '../models/Project.js';
import validate from '../middleware/validate.js';

const router = Router();

const idValidator = param('id').isMongoId().withMessage('Invalid project ID.');
const validStatuses = Object.values(PROJECT_STATUS);

router.get(
  '/',
  [
    query('workspace').isMongoId().withMessage('"workspace" must be a valid MongoDB ObjectId.'),
    validate,
  ],
  getProjectsByWorkspace
);

router.post(
  '/',
  [
    body('name')
      .trim()
      .notEmpty().withMessage('Project name is required.')
      .isLength({ min: 2, max: 150 }),
    body('workspace')
      .isMongoId().withMessage('"workspace" must be a valid MongoDB ObjectId.'),
    body('status')
      .optional()
      .isIn(validStatuses).withMessage(`Status must be one of: ${validStatuses.join(', ')}.`),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('dueDate').optional({ nullable: true }).isISO8601().withMessage('dueDate must be ISO 8601.'),
    validate,
  ],
  createProject
);

router.get('/:id', [idValidator, validate], getProjectById);

router.patch(
  '/:id',
  [
    idValidator,
    body('name').optional().trim().notEmpty().isLength({ min: 2, max: 150 }),
    body('status').optional().isIn(validStatuses),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('dueDate').optional({ nullable: true }).isISO8601(),
    validate,
  ],
  updateProject
);

router.delete('/:id', [idValidator, validate], deleteProject);

export default router;
