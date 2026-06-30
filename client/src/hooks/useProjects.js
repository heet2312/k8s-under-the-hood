/**
 * hooks/useProjects.js — Data fetching hook for the Project resource.
 */
import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { projectApi } from '../api/index.js';
import { useApp, ACTIONS } from '../context/AppContext.jsx';

export const useProjects = () => {
  const { state, dispatch } = useApp();

  const fetchProjects = useCallback(async (workspaceId) => {
    if (!workspaceId) return;
    dispatch({ type: ACTIONS.SET_LOADING, payload: { projects: true } });
    try {
      const res = await projectApi.getByWorkspace(workspaceId);
      dispatch({ type: ACTIONS.SET_PROJECTS, payload: res.data.data });
    } catch (err) {
      dispatch({ type: ACTIONS.SET_ERROR, payload: err.message });
      toast.error(err.message);
    } finally {
      dispatch({ type: ACTIONS.SET_LOADING, payload: { projects: false } });
    }
  }, [dispatch]);

  const createProject = useCallback(async (data) => {
    try {
      const res = await projectApi.create(data);
      dispatch({ type: ACTIONS.ADD_PROJECT, payload: res.data.data });
      toast.success('Project created!');
      return res.data.data;
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  }, [dispatch]);

  const updateProject = useCallback(async (id, data) => {
    try {
      const res = await projectApi.update(id, data);
      dispatch({ type: ACTIONS.UPDATE_PROJECT, payload: res.data.data });
      toast.success('Project updated!');
      return res.data.data;
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  }, [dispatch]);

  const deleteProject = useCallback(async (id) => {
    try {
      await projectApi.delete(id);
      dispatch({ type: ACTIONS.DELETE_PROJECT, payload: id });
      toast.success('Project deleted.');
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  }, [dispatch]);

  const setActiveProject = useCallback((project) => {
    dispatch({ type: ACTIONS.SET_ACTIVE_PROJECT, payload: project });
  }, [dispatch]);

  return {
    projects: state.projects,
    activeProject: state.activeProject,
    loading: state.loading.projects,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
    setActiveProject,
  };
};
