/**
 * models/Task.js
 *
 * A Task is the primary work unit; it belongs to one Project,
 * and through the Project, to one Workspace.
 *
 * Design decisions:
 * - 'project' is a required FK to Project — tasks cannot exist without a project.
 * - 'priority' and 'status' are enums, validated at schema level.
 * - 'assignedTo' stores an email string for simplicity (convert to ObjectId ref
 *   once a User model is introduced).
 * - A composite index on (project + status + priority) supports the most common
 *   filtered task list query.
 * - A text index on title + description allows full-text search.
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

// ── Constants ─────────────────────────────────────────────────────────────────
export const TASK_STATUS = Object.freeze({
  TODO: 'Todo',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  DONE: 'Done',
});

export const TASK_PRIORITY = Object.freeze({
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
});

const TaskSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Task title is required.'],
      trim: true,
      minlength: [2, 'Title must be at least 2 characters.'],
      maxlength: [200, 'Title cannot exceed 200 characters.'],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [5000, 'Description cannot exceed 5000 characters.'],
      default: '',
    },

    status: {
      type: String,
      enum: {
        values: Object.values(TASK_STATUS),
        message: `Status must be one of: ${Object.values(TASK_STATUS).join(', ')}.`,
      },
      default: TASK_STATUS.TODO,
    },

    priority: {
      type: String,
      enum: {
        values: Object.values(TASK_PRIORITY),
        message: `Priority must be one of: ${Object.values(TASK_PRIORITY).join(', ')}.`,
      },
      default: TASK_PRIORITY.MEDIUM,
    },

    // FK → Project (the direct parent)
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project', // Enables .populate('project') and chained .populate('project.workspace')
      required: [true, 'Task must belong to a Project.'],
      index: true,
    },

    // The user this task is assigned to (email string for MVP)
    assignedTo: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'assignedTo must be a valid email address.'],
      default: null,
    },

    // Optional due date for the task
    dueDate: {
      type: Date,
      default: null,
    },

    // Estimated hours for planning/reporting
    estimatedHours: {
      type: Number,
      min: [0, 'Estimated hours cannot be negative.'],
      default: null,
    },

    // Actual hours logged (could be extended to an array of time-log entries)
    loggedHours: {
      type: Number,
      min: [0, 'Logged hours cannot be negative.'],
      default: 0,
    },

    // Array of label strings (e.g. ['bug', 'frontend', 'urgent'])
    labels: {
      type: [String],
      default: [],
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Primary query pattern: "show tasks in project X with status Y and priority Z"
TaskSchema.index({ project: 1, status: 1, priority: 1 });

// For assignee-view: "show all tasks assigned to user@example.com"
TaskSchema.index({ assignedTo: 1, status: 1 });

// Full-text search on title and description
TaskSchema.index({ title: 'text', description: 'text' });

// ── Virtuals ──────────────────────────────────────────────────────────────────
TaskSchema.virtual('isOverdue').get(function () {
  if (!this.dueDate) return false;
  return this.dueDate < new Date() && this.status !== TASK_STATUS.DONE;
});

// ── Middleware (Hooks) ────────────────────────────────────────────────────────
// Pre-find: automatically exclude soft-deleted tasks in all queries
// Note: Uncomment this if you want transparent soft-delete filtering.
// TaskSchema.pre(/^find/, function (next) {
//   this.where({ isDeleted: false });
//   next();
// });

const Task = mongoose.model('Task', TaskSchema);

export default Task;
