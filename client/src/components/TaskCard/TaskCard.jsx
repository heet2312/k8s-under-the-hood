/**
 * components/TaskCard/TaskCard.jsx
 *
 * Displays a single task in list/board views.
 * Shows title, priority indicator, status badge, assignee, and due date.
 */

import { format, isPast } from 'date-fns';
import './TaskCard.css';

// Maps status strings to CSS class names
const STATUS_CLASS = {
  'Todo': 'badge-todo',
  'In Progress': 'badge-progress',
  'In Review': 'badge-review',
  'Done': 'badge-done',
};

const PRIORITY_CLASS = {
  'Low': 'priority-low',
  'Medium': 'priority-medium',
  'High': 'priority-high',
  'Critical': 'priority-critical',
};

const TaskCard = ({ task, onClick, onDelete }) => {
  const { title, description, status, priority, assignedTo, dueDate, labels = [] } = task;

  const isOverdue = dueDate && isPast(new Date(dueDate)) && status !== 'Done';

  return (
    <article className="task-card" onClick={() => onClick?.(task)}>
      {/* Priority stripe */}
      <div className={`task-card-stripe ${PRIORITY_CLASS[priority]}`} />

      <div className="task-card-body">
        {/* Header row */}
        <div className="task-card-header">
          <span className={`badge ${STATUS_CLASS[status] || 'badge-todo'}`}>
            {status}
          </span>
          <div className="task-card-actions">
            <button
              className="btn btn-ghost btn-icon btn-sm task-card-delete"
              onClick={(e) => { e.stopPropagation(); onDelete?.(task); }}
              title="Delete task"
              aria-label="Delete task"
            >
              ×
            </button>
          </div>
        </div>

        {/* Title */}
        <h3 className={`task-card-title ${status === 'Done' ? 'task-card-done' : ''}`}>
          {title}
        </h3>

        {/* Description preview */}
        {description && (
          <p className="task-card-description">{description}</p>
        )}

        {/* Labels */}
        {labels.length > 0 && (
          <div className="task-card-labels">
            {labels.slice(0, 3).map((label) => (
              <span key={label} className="task-label">{label}</span>
            ))}
            {labels.length > 3 && (
              <span className="task-label task-label-more">+{labels.length - 3}</span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="task-card-footer">
          <div className="task-card-meta">
            {/* Priority */}
            <span className="task-meta-item" title={`Priority: ${priority}`}>
              <span className={`priority-dot ${PRIORITY_CLASS[priority]}`} />
              {priority}
            </span>

            {/* Due date */}
            {dueDate && (
              <span className={`task-meta-item ${isOverdue ? 'task-overdue' : ''}`}>
                🗓 {format(new Date(dueDate), 'MMM d')}
                {isOverdue && ' (overdue)'}
              </span>
            )}
          </div>

          {/* Assignee avatar */}
          {assignedTo && (
            <div className="task-assignee" title={assignedTo}>
              {assignedTo.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </article>
  );
};

export default TaskCard;
