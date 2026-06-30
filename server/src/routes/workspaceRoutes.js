/**
 * routes/workspaceRoutes.js
 *
 * Route summary:
 *   GET    /api/workspaces         → list all workspaces
 *   POST   /api/workspaces         → create workspace
 *   GET    /api/workspaces/:id     → get one workspace
 *   PATCH  /api/workspaces/:id     → partial update
 *   DELETE /api/workspaces/:id     → soft-delete (cascades to projects)
 */

import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  getAllWorkspaces,
  getWorkspaceById,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
} from '../controllers/workspaceController.js';
import validate from '../middleware/validate.js';

const router = Router();

const idValidator = param('id').isMongoId().withMessage('Invalid workspace ID.');

router.get('/', getAllWorkspaces);

router.post(
  '/',
  [
    body('name')
      .trim()
      .notEmpty().withMessage('Workspace name is required.')
      .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 }),
    body('members')
      .optional()
      .isArray().withMessage('Members must be an array of email strings.'),
    body('members.*')
      .optional()
      .isEmail().withMessage('Each member must be a valid email address.')
      .normalizeEmail(),
    validate,
  ],
  createWorkspace
);

router.get('/:id', [idValidator, validate], getWorkspaceById);

router.patch(
  '/:id',
  [
    idValidator,
    body('name').optional().trim().notEmpty().isLength({ min: 2, max: 100 }),
    body('description').optional().trim().isLength({ max: 500 }),
    body('members').optional().isArray(),
    body('members.*').optional().isEmail().normalizeEmail(),
    validate,
  ],
  updateWorkspace
);

router.delete('/:id', [idValidator, validate], deleteWorkspace);

export default router;
