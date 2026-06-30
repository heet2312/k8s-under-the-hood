/**
 * components/TaskModal/TaskModal.jsx
 *
 * Modal dialog for creating & editing tasks.
 * Renders inside a portal-like overlay (positioned fixed via CSS).
 *
 * Features:
 * - Controlled form with React useState
 * - Populated with existing task data when editing
 * - Calls createTask or updateTask based on whether `task` prop is provided
 * - Closes on backdrop click and Escape key
 */

import { useState, useEffect, useCallback } from 'react';
import { TASK_STATUSES, TASK_PRIORITIES } from '../../utils/constants.js';
import './TaskModal.css';

const EMPTY_FORM = {
  title: '',
  description: '',
  status: 'Todo',
  priority: 'Medium',
  assignedTo: '',
  dueDate: '',
  estimatedHours: '',
  labels: '',
};

const TaskModal = ({ task, projectId, onSave, onClose }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  // Populate form when editing an existing task
  useEffect(() => {
    if (task) {
      setForm({
        title: task.title || '',
        description: task.description || '',
        status: task.status || 'Todo',
        priority: task.priority || 'Medium',
        assignedTo: task.assignedTo || '',
        dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
        estimatedHours: task.estimatedHours ?? '',
        labels: (task.labels || []).join(', '),
      });
    }
  }, [task]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const validate = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Title is required.';
    if (form.assignedTo && !/^\S+@\S+\.\S+$/.test(form.assignedTo)) {
      errs.assignedTo = 'Must be a valid email.';
    }
    return errs;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        status: form.status,
        priority: form.priority,
        assignedTo: form.assignedTo.trim() || null,
        dueDate: form.dueDate || null,
        estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : null,
        labels: form.labels.split(',').map((l) => l.trim()).filter(Boolean),
        ...(task ? {} : { project: projectId }), // Only include project FK on create
      };
      await onSave(task?._id, payload);
      onClose();
    } catch {
      // Error toast is handled in the hook
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal task-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2>{task ? 'Edit Task' : 'Create Task'}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close modal">
            <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          {/* Title */}
          <div className="input-group">
            <label className="input-label" htmlFor="task-title">Title *</label>
            <input
              id="task-title"
              name="title"
              className={`input ${errors.title ? 'input-error' : ''}`}
              placeholder="What needs to be done?"
              value={form.title}
              onChange={handleChange}
              autoFocus
            />
            {errors.title && <span className="field-error">{errors.title}</span>}
          </div>

          {/* Description */}
          <div className="input-group" style={{ marginTop: 'var(--space-3)' }}>
            <label className="input-label" htmlFor="task-desc">Description</label>
            <textarea
              id="task-desc"
              name="description"
              className="input"
              placeholder="Add more detail…"
              rows={3}
              value={form.description}
              onChange={handleChange}
            />
          </div>

          {/* Status + Priority row */}
          <div className="task-modal-row">
            <div className="input-group flex-1">
              <label className="input-label" htmlFor="task-status">Status</label>
              <select id="task-status" name="status" className="input" value={form.status} onChange={handleChange}>
                {TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="input-group flex-1">
              <label className="input-label" htmlFor="task-priority">Priority</label>
              <select id="task-priority" name="priority" className="input" value={form.priority} onChange={handleChange}>
                {TASK_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Assignee + Due Date row */}
          <div className="task-modal-row">
            <div className="input-group flex-1">
              <label className="input-label" htmlFor="task-assignee">Assigned To</label>
              <input
                id="task-assignee"
                name="assignedTo"
                type="email"
                className={`input ${errors.assignedTo ? 'input-error' : ''}`}
                placeholder="user@example.com"
                value={form.assignedTo}
                onChange={handleChange}
              />
              {errors.assignedTo && <span className="field-error">{errors.assignedTo}</span>}
            </div>
            <div className="input-group flex-1">
              <label className="input-label" htmlFor="task-due">Due Date</label>
              <input
                id="task-due"
                name="dueDate"
                type="date"
                className="input"
                value={form.dueDate}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Estimate + Labels row */}
          <div className="task-modal-row">
            <div className="input-group flex-1">
              <label className="input-label" htmlFor="task-estimate">Estimated Hours</label>
              <input
                id="task-estimate"
                name="estimatedHours"
                type="number"
                min="0"
                step="0.5"
                className="input"
                placeholder="e.g. 8"
                value={form.estimatedHours}
                onChange={handleChange}
              />
            </div>
            <div className="input-group flex-1">
              <label className="input-label" htmlFor="task-labels">Labels</label>
              <input
                id="task-labels"
                name="labels"
                className="input"
                placeholder="bug, frontend, urgent"
                value={form.labels}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" /> : null}
              {task ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskModal;
