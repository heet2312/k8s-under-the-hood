/**
 * api/workspaceApi.js — Workspace resource API calls
 */
import client from './client.js';

export const workspaceApi = {
  getAll: () => client.get('/workspaces'),
  getById: (id) => client.get(`/workspaces/${id}`),
  create: (data) => client.post('/workspaces', data),
  update: (id, data) => client.patch(`/workspaces/${id}`, data),
  delete: (id) => client.delete(`/workspaces/${id}`),
};

/**
 * api/projectApi.js — Project resource API calls
 */
export const projectApi = {
  getByWorkspace: (workspaceId) => client.get(`/projects?workspace=${workspaceId}`),
  getById: (id) => client.get(`/projects/${id}`),
  create: (data) => client.post('/projects', data),
  update: (id, data) => client.patch(`/projects/${id}`, data),
  delete: (id) => client.delete(`/projects/${id}`),
};

/**
 * api/taskApi.js — Task resource API calls
 */
export const taskApi = {
  getByProject: (projectId, params = {}) =>
    client.get('/tasks', { params: { project: projectId, ...params } }),
  getById: (id) => client.get(`/tasks/${id}`),
  create: (data) => client.post('/tasks', data),
  update: (id, data) => client.patch(`/tasks/${id}`, data),
  delete: (id) => client.delete(`/tasks/${id}`),
  restore: (id) => client.patch(`/tasks/${id}/restore`),
};
