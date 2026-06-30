/**
 * controllers/projectController.js
 *
 * CRUD for Projects — belong to a Workspace, contain Tasks.
 */

import Project from '../models/Project.js';
import Workspace from '../models/Workspace.js';
import Task from '../models/Task.js';
import { ApiError, ApiResponse } from '../utils/ApiResponse.js';

// GET /api/projects?workspace=<id>
export const getProjectsByWorkspace = async (req, res) => {
  const { workspace: workspaceId } = req.query;
  if (!workspaceId) throw new ApiError(400, 'Query param "workspace" is required.');

  const projects = await Project.findByWorkspace(workspaceId); // uses static method
  res.status(200).json(new ApiResponse(200, projects, 'Projects fetched successfully.'));
};

// GET /api/projects/:id  (populated with workspace details)
export const getProjectById = async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, isDeleted: false })
    .populate('workspace', 'name description members');
  if (!project) throw new ApiError(404, `Project '${req.params.id}' not found.`);
  res.status(200).json(new ApiResponse(200, project, 'Project fetched successfully.'));
};

// POST /api/projects
export const createProject = async (req, res) => {
  const { name, description, status, workspace: workspaceId, dueDate } = req.body;

  const workspace = await Workspace.findOne({ _id: workspaceId, isDeleted: false });
  if (!workspace) throw new ApiError(404, `Workspace '${workspaceId}' not found.`);

  const project = await Project.create({ name, description, status, workspace: workspaceId, dueDate });
  res.status(201).json(new ApiResponse(201, project, 'Project created successfully.'));
};

// PATCH /api/projects/:id
export const updateProject = async (req, res) => {
  const { name, description, status, dueDate } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (dueDate !== undefined) updates.dueDate = dueDate;

  const project = await Project.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { $set: updates },
    { new: true, runValidators: true }
  ).populate('workspace', 'name');

  if (!project) throw new ApiError(404, `Project '${req.params.id}' not found.`);
  res.status(200).json(new ApiResponse(200, project, 'Project updated successfully.'));
};

// DELETE /api/projects/:id  (soft-delete with cascade to Tasks)
export const deleteProject = async (req, res) => {
  const project = await Project.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { $set: { isDeleted: true } },
    { new: true }
  );
  if (!project) throw new ApiError(404, `Project '${req.params.id}' not found.`);

  // Cascade: soft-delete all tasks in this project
  await Task.updateMany({ project: project._id }, { $set: { isDeleted: true } });

  res.status(200).json(new ApiResponse(200, { id: project._id }, 'Project deleted successfully.'));
};
