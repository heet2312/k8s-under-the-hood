/**
 * pages/Dashboard/Dashboard.jsx
 * 
 * Default landing page when no project is selected.
 * Shows high-level metrics and a workspace overview.
 */

import { useWorkspaces } from '../../hooks/useWorkspaces.js';
import { useProjects } from '../../hooks/useProjects.js';
import './Dashboard.css';

const Dashboard = () => {
  const { activeWorkspace } = useWorkspaces();
  const { projects } = useProjects();

  if (!activeWorkspace) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">👋</div>
        <h2>Welcome to TaskFlow</h2>
        <p className="text-muted">Select or create a workspace from the sidebar to get started.</p>
      </div>
    );
  }

  const activeProjects = projects.filter(p => p.status === 'Active');
  const planningProjects = projects.filter(p => p.status === 'Planning');

  return (
    <div className="dashboard">
      <header className="page-header">
        <h1>{activeWorkspace.name}</h1>
        <p className="text-muted">{activeWorkspace.description || 'Workspace Overview'}</p>
      </header>

      {/* Metrics Row */}
      <section className="dashboard-metrics grid-3">
        <div className="stat-card">
          <div className="stat-icon bg-brand-subtle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div>
            <h3 className="stat-label">Total Projects</h3>
            <p className="stat-value">{projects.length}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-success-subtle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          </div>
          <div>
            <h3 className="stat-label">Active Projects</h3>
            <p className="stat-value">{activeProjects.length}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-info-subtle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div>
            <h3 className="stat-label">Team Members</h3>
            <p className="stat-value">{activeWorkspace.members.length}</p>
          </div>
        </div>
      </section>

      {/* Projects List */}
      <section className="dashboard-section">
        <h2>Recent Projects</h2>
        <div className="divider" />
        
        {projects.length === 0 ? (
          <div className="empty-state">
            <p className="text-muted">No projects in this workspace yet.</p>
          </div>
        ) : (
          <div className="grid-2">
            {projects.slice(0, 4).map(p => (
              <div key={p._id} className="card project-card">
                <div className="flex justify-between items-start">
                  <h3 className="text-lg mb-1">{p.name}</h3>
                  <span className={`badge badge-${p.status.toLowerCase().replace(' ', '-')}`}>
                    {p.status}
                  </span>
                </div>
                <p className="text-sm text-secondary mt-2 line-clamp-2">{p.description}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Dashboard;
