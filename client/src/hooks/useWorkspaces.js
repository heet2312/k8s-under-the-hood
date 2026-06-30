/**
 * hooks/useWorkspaces.js — Data fetching hook for the Workspace resource.
 * Handles loading, error, and CRUD operations, dispatching to global context.
 */
import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { workspaceApi } from '../api/index.js';
import { useApp, ACTIONS } from '../context/AppContext.jsx';

export const useWorkspaces = () => {
  const { state, dispatch } = useApp();

  const fetchWorkspaces = useCallback(async () => {
    dispatch({ type: ACTIONS.SET_LOADING, payload: { workspaces: true } });
    try {
      const res = await workspaceApi.getAll();
      dispatch({ type: ACTIONS.SET_WORKSPACES, payload: res.data.data });
    } catch (err) {
      dispatch({ type: ACTIONS.SET_ERROR, payload: err.message });
      toast.error(err.message);
    } finally {
      dispatch({ type: ACTIONS.SET_LOADING, payload: { workspaces: false } });
    }
  }, [dispatch]);

  const createWorkspace = useCallback(async (data) => {
    try {
      const res = await workspaceApi.create(data);
      dispatch({ type: ACTIONS.ADD_WORKSPACE, payload: res.data.data });
      toast.success('Workspace created!');
      return res.data.data;
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  }, [dispatch]);

  const updateWorkspace = useCallback(async (id, data) => {
    try {
      const res = await workspaceApi.update(id, data);
      dispatch({ type: ACTIONS.UPDATE_WORKSPACE, payload: res.data.data });
      toast.success('Workspace updated!');
      return res.data.data;
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  }, [dispatch]);

  const deleteWorkspace = useCallback(async (id) => {
    try {
      await workspaceApi.delete(id);
      dispatch({ type: ACTIONS.DELETE_WORKSPACE, payload: id });
      toast.success('Workspace deleted.');
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  }, [dispatch]);

  const setActiveWorkspace = useCallback((workspace) => {
    dispatch({ type: ACTIONS.SET_ACTIVE_WORKSPACE, payload: workspace });
  }, [dispatch]);

  return {
    workspaces: state.workspaces,
    activeWorkspace: state.activeWorkspace,
    loading: state.loading.workspaces,
    fetchWorkspaces,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    setActiveWorkspace,
  };
};
