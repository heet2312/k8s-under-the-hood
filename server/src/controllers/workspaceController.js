/**
 * controllers/workspaceController.js
 *
 * CRUD for Workspaces — the top-level organizational unit.
 */

import Workspace from '../models/Workspace.js';
import Project from '../models/Project.js';
import { ApiError, ApiResponse } from '../utils/ApiResponse.js';

// GET /api/workspaces
export const getAllWorkspaces = async (req, res) => {
  const workspaces = await Workspace.find({ isDeleted: false })
    .sort({ createdAt: -1 })
    .lean();
  res.status(200).json(new ApiResponse(200, workspaces, 'Workspaces fetched successfully.'));
};

// GET /api/workspaces/:id
export const getWorkspaceById = async (req, res) => {
  const workspace = await Workspace.findOne({ _id: req.params.id, isDeleted: false });
  if (!workspace) throw new ApiError(404, `Workspace '${req.params.id}' not found.`);
  res.status(200).json(new ApiResponse(200, workspace, 'Workspace fetched successfully.'));
};

// POST /api/workspaces
export const createWorkspace = async (req, res) => {
  const { name, description, members } = req.body;
  const workspace = await Workspace.create({ name, description, members });
  res.status(201).json(new ApiResponse(201, workspace, 'Workspace created successfully.'));
};

// PATCH /api/workspaces/:id
export const updateWorkspace = async (req, res) => {
  const { name, description, members } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (members !== undefined) updates.members = members;

  const workspace = await Workspace.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { $set: updates },
    { new: true, runValidators: true }
  );
  if (!workspace) throw new ApiError(404, `Workspace '${req.params.id}' not found.`);
  res.status(200).json(new ApiResponse(200, workspace, 'Workspace updated successfully.'));
};

// DELETE /api/workspaces/:id  (soft-delete cascade handled asynchronously)
export const deleteWorkspace = async (req, res) => {
  const workspace = await Workspace.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { $set: { isDeleted: true } },
    { new: true }
  );
  if (!workspace) throw new ApiError(404, `Workspace '${req.params.id}' not found.`);

  // Cascade soft-delete to all child projects
  await Project.updateMany({ workspace: workspace._id }, { $set: { isDeleted: true } });

  res.status(200).json(new ApiResponse(200, { id: workspace._id }, 'Workspace deleted successfully.'));
};
