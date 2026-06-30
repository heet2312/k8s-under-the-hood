/**
 * pages/Board/Board.jsx
 *
 * Kanban board view for a specific project.
 * Uses the global context and custom hooks for data fetching.
 */

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTasks } from '../../hooks/useTasks.js';
import { useProjects } from '../../hooks/useProjects.js';
import { TASK_STATUSES } from '../../utils/constants.js';
import TaskCard from '../../components/TaskCard/TaskCard.jsx';
import TaskModal from '../../components/TaskModal/TaskModal.jsx';
import './Board.css';

const Board = () => {
  const { projectId } = useParams();
  const { tasks, loading: tasksLoading, fetchTasks, createTask, updateTask, deleteTask } = useTasks();
  const { projects } = useProjects();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const project = useMemo(() => 
    projects.find(p => p._id === projectId), 
  [projects, projectId]);

  useEffect(() => {
    if (projectId) {
      fetchTasks(projectId);
    }
  }, [projectId, fetchTasks]);

  // Group tasks by status for the board columns
  const columns = useMemo(() => {
    const cols = Object.fromEntries(TASK_STATUSES.map(status => [status, []]));
    tasks.forEach(task => {
      if (cols[task.status]) {
        cols[task.status].push(task);
      }
    });
    return cols;
  }, [tasks]);

  const handleCreateTask = () => {
    setEditingTask(null);
    setIsModalOpen(true);
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleSaveTask = async (id, data) => {
    if (id) {
      await updateTask(id, data);
    } else {
      await createTask(data);
    }
  };

  const handleDeleteTask = async (task) => {
    if (window.confirm(`Are you sure you want to delete "${task.title}"?`)) {
      await deleteTask(task._id);
    }
  };

  if (!project) {
    return <div className="board-loading">Target project not found.</div>;
  }

  return (
    <div className="board-container">
      <header className="board-header">
        <div>
          <h1 className="board-title">{project.name}</h1>
          <p className="board-meta">
            {tasks.length} tasks • Status: <span className="text-brand">{project.status}</span>
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleCreateTask}>
          + New Task
        </button>
      </header>

      {tasksLoading && tasks.length === 0 ? (
        <div className="board-loading">
          <span className="spinner spinner-lg"></span>
        </div>
      ) : (
        <div className="board-canvas">
          {TASK_STATUSES.map(status => (
            <div key={status} className="board-column">
              <div className="board-column-header">
                <h3 className="board-column-title">{status}</h3>
                <span className="board-column-count">{columns[status].length}</span>
              </div>
              <div className="board-column-content">
                {columns[status].map(task => (
                  <TaskCard 
                    key={task._id} 
                    task={task} 
                    onClick={handleEditTask}
                    onDelete={handleDeleteTask}
                  />
                ))}
                {columns[status].length === 0 && (
                  <div className="board-column-empty">
                    Drop tasks here
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <TaskModal
          task={editingTask}
          projectId={projectId}
          onSave={handleSaveTask}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
};

export default Board;
