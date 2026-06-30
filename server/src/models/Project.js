/**
 * models/Project.js
 *
 * A Project belongs to exactly one Workspace.
 * It contains many Tasks (one-to-many, with Tasks holding the FK reference).
 *
 * Design decisions:
 * - 'workspace' uses an ObjectId ref so Mongoose can .populate() it.
 * - 'status' is an enum for strict validation at the schema level.
 * - A compound index on (workspace + status) enables efficient dashboard queries
 *   like "show me all Active projects in workspace X."
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

// ── Constants ─────────────────────────────────────────────────────────────────
export const PROJECT_STATUS = Object.freeze({
  PLANNING: 'Planning',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
});

const ProjectSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Project name is required.'],
      trim: true,
      minlength: [2, 'Project name must be at least 2 characters.'],
      maxlength: [150, 'Project name cannot exceed 150 characters.'],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters.'],
      default: '',
    },

    status: {
      type: String,
      enum: {
        values: Object.values(PROJECT_STATUS),
        message: `Status must be one of: ${Object.values(PROJECT_STATUS).join(', ')}.`,
      },
      default: PROJECT_STATUS.PLANNING,
    },

    // FK → Workspace (the parent organizational unit)
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace', // Enables Mongoose .populate('workspace')
      required: [true, 'Project must belong to a Workspace.'],
      index: true, // Index FK for fast lookups: Project.find({ workspace: id })
    },

    // Optional deadline for a project
    dueDate: {
      type: Date,
      default: null,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Compound: used heavily by the dashboard ("all active projects in workspace X")
ProjectSchema.index({ workspace: 1, status: 1 });
ProjectSchema.index({ workspace: 1, isDeleted: 1 });

// ── Virtuals ──────────────────────────────────────────────────────────────────
// isOverdue: computed flag without storing redundant data
ProjectSchema.virtual('isOverdue').get(function () {
  if (!this.dueDate) return false;
  return this.dueDate < new Date() && this.status !== PROJECT_STATUS.COMPLETED;
});

// ── Static Methods ────────────────────────────────────────────────────────────
/**
 * Fetches all non-deleted projects for a given workspace,
 * populated with their parent workspace details.
 */
ProjectSchema.statics.findByWorkspace = async function (workspaceId) {
  return this.find({ workspace: workspaceId, isDeleted: false })
    .populate('workspace', 'name description') // Partial select — only name & description
    .sort({ createdAt: -1 });
};

const Project = mongoose.model('Project', ProjectSchema);

export default Project;
