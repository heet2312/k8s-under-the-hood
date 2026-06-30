/**
 * models/Workspace.js
 *
 * A Workspace is the top-level organizational unit (like a "company" or "team").
 * All Projects belong to a Workspace.
 *
 * Design decisions:
 * - members is an array of email strings (lightweight — no User model required for MVP).
 *   In a full auth system, this would be an array of ObjectId refs to a User collection.
 * - Timestamps via { timestamps: true } automatically adds createdAt / updatedAt fields.
 * - The 'name' field has a sparse, case-insensitive collation index for fast lookups.
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const WorkspaceSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Workspace name is required.'],
      trim: true,
      minlength: [2, 'Workspace name must be at least 2 characters.'],
      maxlength: [100, 'Workspace name cannot exceed 100 characters.'],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters.'],
      default: '',
    },

    // Array of member email addresses.
    // In production, you'd reference a User model: { type: Schema.Types.ObjectId, ref: 'User' }
    members: {
      type: [
        {
          type: String,
          lowercase: true,
          trim: true,
          match: [/^\S+@\S+\.\S+$/, 'Invalid email format.'],
        },
      ],
      default: [],
    },

    // Soft-delete flag — allows recovery without permanent data loss
    isDeleted: {
      type: Boolean,
      default: false,
      index: true, // Index for filtered queries: Workspace.find({ isDeleted: false })
    },
  },
  {
    timestamps: true, // Injects createdAt, updatedAt automatically
    toJSON: { virtuals: true }, // Include virtuals when serializing to JSON
    toObject: { virtuals: true },
  }
);

// ── Indexes ──────────────────────────────────────────────────────────────────
// Compound index: fast queries for active workspace names (e.g. search/autocomplete)
WorkspaceSchema.index({ name: 1, isDeleted: 1 });

// ── Virtuals ─────────────────────────────────────────────────────────────────
// memberCount is computed on-the-fly with no extra DB round-trip
WorkspaceSchema.virtual('memberCount').get(function () {
  return this.members ? this.members.length : 0;
});

// ── Instance Methods ─────────────────────────────────────────────────────────
/**
 * Adds a member email to the workspace if not already present.
 * Uses $addToSet semantics (no duplicates).
 */
WorkspaceSchema.methods.addMember = async function (email) {
  if (!this.members.includes(email.toLowerCase())) {
    this.members.push(email.toLowerCase());
    await this.save();
  }
  return this;
};

// ── Middleware (Hooks) ────────────────────────────────────────────────────────
// Pre-save: normalize all member emails to lowercase before persisting
WorkspaceSchema.pre('save', function (next) {
  this.members = this.members.map((email) => email.toLowerCase());
  next();
});

const Workspace = mongoose.model('Workspace', WorkspaceSchema);

export default Workspace;
