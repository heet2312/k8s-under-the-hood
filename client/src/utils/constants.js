/**
 * utils/constants.js
 * Shared constants for the client — mirrors the server-side enums.
 */

export const TASK_STATUSES = ['Todo', 'In Progress', 'In Review', 'Done'];

export const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

export const PROJECT_STATUSES = ['Planning', 'Active', 'Completed', 'Archived'];

export const PRIORITY_COLORS = {
  Low: '#22c55e',
  Medium: '#f59e0b',
  High: '#f97316',
  Critical: '#ef4444',
};

export const STATUS_LABELS = {
  Todo:        { label: 'Todo',       class: 'badge-todo' },
  'In Progress': { label: 'In Progress', class: 'badge-progress' },
  'In Review':   { label: 'In Review',   class: 'badge-review' },
  Done:        { label: 'Done',       class: 'badge-done' },
};
