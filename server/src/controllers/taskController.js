/**
 * controllers/taskController.js
 *
 * Full CRUD controller for Tasks.
 * Each handler follows the same pattern:
 *   1. Extract & validate input (express-validator handles basic rules in the router)
 *   2. Execute Mongoose query
 *   3. Return a standardized ApiResponse
 *   4. Errors bubble up to the global errorHandler (via express-async-errors)
 *
 * Key Mongoose feature: .populate()
 *   The getTaskById handler chains two .populate() calls to resolve:
 *     Task → Project → Workspace
 *   giving the client a fully denormalized document in a single request.
 */

import Task, { TASK_STATUS, TASK_PRIORITY } from '../models/Task.js';
import Project from '../models/Project.js';
import { ApiError, ApiResponse } from '../utils/ApiResponse.js';

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/tasks/:id
// Fetches a single task and deeply populates its project + workspace context.
// This is the primary example of chained .populate() usage.
// ─────────────────────────────────────────────────────────────────────────────
export const getTaskById = async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, isDeleted: false })
    // Step 1: populate the 'project' field on the Task document
    .populate({
      path: 'project',
      select: 'name description status dueDate', // Only fetch needed fields (projection)
      // Step 2: inside the populated Project, also populate its 'workspace' field
      populate: {
        path: 'workspace',
        select: 'name description members', // Partial select for security/bandwidth
      },
    });

  if (!task) {
    throw new ApiError(404, `Task with id '${req.params.id}' not found.`);
  }

  res.status(200).json(new ApiResponse(200, task, 'Task fetched successfully.'));
};

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/tasks?project=<id>&status=&priority=&page=&limit=
// Paginated, filtered task list for a given project.
// ─────────────────────────────────────────────────────────────────────────────
export const getTasksByProject = async (req, res) => {
  const { project: projectId, status, priority, assignedTo, page = 1, limit = 20 } = req.query;

  if (!projectId) {
    throw new ApiError(400, 'Query parameter "project" (projectId) is required.');
  }

  // Verify the project exists
  const projectExists = await Project.exists({ _id: projectId, isDeleted: false });
  if (!projectExists) {
    throw new ApiError(404, `Project '${projectId}' not found.`);
  }

  // Build a dynamic filter object — only add keys the client actually sent
  const filter = { project: projectId, isDeleted: false };
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (assignedTo) filter.assignedTo = assignedTo.toLowerCase();

  // Execute count + data queries in parallel for efficiency
  const [total, tasks] = await Promise.all([
    Task.countDocuments(filter),
    Task.find(filter)
      .populate('project', 'name status workspace') // Light populate for list views
      .sort({ priority: -1, createdAt: -1 }) // High priority first, then newest
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean(), // .lean() returns plain JS objects — faster when you don't need Mongoose doc methods
  ]);

  res.status(200).json(
    new ApiResponse(200, {
      tasks,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    }, 'Tasks fetched successfully.')
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// POST  /api/tasks
// Creates a new task after verifying the parent project exists.
// ─────────────────────────────────────────────────────────────────────────────
export const createTask = async (req, res) => {
  const { title, description, status, priority, project: projectId, assignedTo, dueDate, estimatedHours, labels } = req.body;

  // Guard: ensure the referenced project actually exists and is not deleted
  const project = await Project.findOne({ _id: projectId, isDeleted: false });
  if (!project) {
    throw new ApiError(404, `Project '${projectId}' not found. Cannot create task.`);
  }

  const task = await Task.create({
    title,
    description,
    status: status || TASK_STATUS.TODO,
    priority: priority || TASK_PRIORITY.MEDIUM,
    project: projectId,
    assignedTo: assignedTo || null,
    dueDate: dueDate || null,
    estimatedHours: estimatedHours || null,
    labels: labels || [],
  });

  // Populate the response so the client has project context immediately
  const populatedTask = await task.populate('project', 'name status');

  res.status(201).json(new ApiResponse(201, populatedTask, 'Task created successfully.'));
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH  /api/tasks/:id
// Partial update (PATCH semantics) — only updates fields the client sends.
// ─────────────────────────────────────────────────────────────────────────────
export const updateTask = async (req, res) => {
  const { title, description, status, priority, assignedTo, dueDate, estimatedHours, loggedHours, labels } = req.body;
  const updates = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  if (assignedTo !== undefined) updates.assignedTo = assignedTo;
  if (dueDate !== undefined) updates.dueDate = dueDate;
  if (estimatedHours !== undefined) updates.estimatedHours = estimatedHours;
  if (loggedHours !== undefined) updates.loggedHours = loggedHours;
  if (labels !== undefined) updates.labels = labels;

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, 'No valid fields provided for update.');
  }

  // { new: true } returns the updated document; runValidators ensures schema rules apply on update
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { $set: updates },
    { new: true, runValidators: true }
  ).populate({
    path: 'project',
    select: 'name status',
    populate: { path: 'workspace', select: 'name' },
  });

  if (!task) {
    throw new ApiError(404, `Task with id '${req.params.id}' not found.`);
  }

  res.status(200).json(new ApiResponse(200, task, 'Task updated successfully.'));
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE  /api/tasks/:id
// Soft-delete: sets isDeleted = true instead of destroying the document.
// This preserves audit history and allows recovery.
// ─────────────────────────────────────────────────────────────────────────────
export const deleteTask = async (req, res) => {
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, isDeleted: false },
    { $set: { isDeleted: true } },
    { new: true }
  );

  if (!task) {
    throw new ApiError(404, `Task with id '${req.params.id}' not found.`);
  }

  res.status(200).json(new ApiResponse(200, { id: task._id }, 'Task deleted successfully.'));
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH  /api/tasks/:id/restore
// Restores a soft-deleted task.
// ─────────────────────────────────────────────────────────────────────────────
export const restoreTask = async (req, res) => {
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, isDeleted: true },
    { $set: { isDeleted: false } },
    { new: true }
  );

  if (!task) {
    throw new ApiError(404, `No deleted task found with id '${req.params.id}'.`);
  }

  res.status(200).json(new ApiResponse(200, task, 'Task restored successfully.'));
};
