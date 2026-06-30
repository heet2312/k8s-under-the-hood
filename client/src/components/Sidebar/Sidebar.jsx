/**
 * components/Sidebar/Sidebar.jsx
 *
 * Primary navigation sidebar. Displays:
 * - App logo & brand
 * - Workspace switcher with list of workspaces
 * - Project list for the active workspace
 * - Navigation links (Dashboard, etc.)
 */

import { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useWorkspaces } from '../../hooks/useWorkspaces.js';
import { useProjects } from '../../hooks/useProjects.js';
import './Sidebar.css';

const Sidebar = () => {
  const navigate = useNavigate();
  const {
    workspaces, activeWorkspace, loading: wsLoading,
    fetchWorkspaces, setActiveWorkspace, createWorkspace
  } = useWorkspaces();
  const {
    projects, activeProject, loading: pjLoading,
    fetchProjects, setActiveProject, createProject
  } = useProjects();

  // Load workspaces on mount
  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // Load projects whenever the active workspace changes
  useEffect(() => {
    if (activeWorkspace) fetchProjects(activeWorkspace._id);
  }, [activeWorkspace, fetchProjects]);

  const handleWorkspaceSelect = (ws) => {
    setActiveWorkspace(ws);
    navigate('/');
  };

  const handleProjectSelect = (project) => {
    setActiveProject(project);
    navigate(`/projects/${project._id}/tasks`);
  };

  const handleNewWorkspace = async () => {
    const name = window.prompt('Enter new workspace name:');
    if (name?.trim()) {
      const ws = await createWorkspace({ name: name.trim() });
      setActiveWorkspace(ws);
      navigate('/');
    }
  };

  const handleNewProject = async () => {
    const name = window.prompt('Enter new project name:');
    if (name?.trim()) {
      const p = await createProject({ name: name.trim(), workspace: activeWorkspace._id });
      setActiveProject(p);
      navigate(`/projects/${p._id}/tasks`);
    }
  };

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor" />
            <rect x="13" y="3" width="8" height="8" rx="2" fill="currentColor" opacity="0.6" />
            <rect x="3" y="13" width="8" height="8" rx="2" fill="currentColor" opacity="0.6" />
            <rect x="13" y="13" width="8" height="8" rx="2" fill="currentColor" opacity="0.3" />
          </svg>
        </div>
        <span className="sidebar-brand-name">TaskFlow</span>
        <span className="sidebar-version-badge" style={{ fontSize: '10px', backgroundColor: 'var(--color-primary)', color: 'white', padding: '2px 6px', borderRadius: '12px', marginLeft: '8px' }}>v1.0.1</span>
      </div>

      {/* Main Nav */}
      <nav className="sidebar-nav">
        <NavLink to="/" end className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 10a8 8 0 1116 0A8 8 0 012 10zm8-3a1 1 0 100-2 1 1 0 000 2zm0 1a3 3 0 100 6 3 3 0 000-6z" clipRule="evenodd" fillRule="evenodd" />
          </svg>
          Dashboard
        </NavLink>
      </nav>

      <div className="sidebar-divider" />

      {/* Workspaces */}
      <section className="sidebar-section">
        <div className="sidebar-section-header">
          <span>Workspaces</span>
          <button onClick={handleNewWorkspace} className="sidebar-action-btn" title="New workspace">+</button>
        </div>

        {wsLoading ? (
          <div className="sidebar-skeleton-list">
            {[1,2,3].map(i => <div key={i} className="skeleton sidebar-skeleton-item" />)}
          </div>
        ) : workspaces.length === 0 ? (
          <p className="sidebar-empty">No workspaces yet.</p>
        ) : (
          <ul className="sidebar-list">
            {workspaces.map((ws) => (
              <li key={ws._id}>
                <button
                  className={`sidebar-ws-item ${activeWorkspace?._id === ws._id ? 'active' : ''}`}
                  onClick={() => handleWorkspaceSelect(ws)}
                >
                  <span className="sidebar-ws-avatar">
                    {ws.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{ws.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Projects in active workspace */}
      {activeWorkspace && (
        <>
          <div className="sidebar-divider" />
          <section className="sidebar-section">
            <div className="sidebar-section-header">
              <span>Projects</span>
              <button onClick={handleNewProject} className="sidebar-action-btn" title="New project">+</button>
            </div>

            {pjLoading ? (
              <div className="sidebar-skeleton-list">
                {[1,2].map(i => <div key={i} className="skeleton sidebar-skeleton-item" />)}
              </div>
            ) : projects.length === 0 ? (
              <p className="sidebar-empty">No projects yet.</p>
            ) : (
              <ul className="sidebar-list">
                {projects.map((p) => (
                  <li key={p._id}>
                    <button
                      className={`sidebar-project-item ${activeProject?._id === p._id ? 'active' : ''}`}
                      onClick={() => handleProjectSelect(p)}
                    >
                      <span className={`sidebar-project-dot status-${p.status?.toLowerCase()}`} />
                      <span className="truncate">{p.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">U</div>
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">User</span>
            <span className="sidebar-user-role">Admin</span>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
