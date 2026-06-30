/**
 * hooks/useTasks.js — Data fetching hook for the Task resource.
 */
import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { taskApi } from '../api/index.js';
import { useApp, ACTIONS } from '../context/AppContext.jsx';

export const useTasks = () => {
  const { state, dispatch } = useApp();

  const fetchTasks = useCallback(async (projectId, params = {}) => {
    if (!projectId) return;
    dispatch({ type: ACTIONS.SET_LOADING, payload: { tasks: true } });
    try {
      const res = await taskApi.getByProject(projectId, params);
      dispatch({ type: ACTIONS.SET_TASKS, payload: res.data.data.tasks });
    } catch (err) {
      dispatch({ type: ACTIONS.SET_ERROR, payload: err.message });
      toast.error(err.message);
    } finally {
      dispatch({ type: ACTIONS.SET_LOADING, payload: { tasks: false } });
    }
  }, [dispatch]);

  const createTask = useCallback(async (data) => {
    try {
      const res = await taskApi.create(data);
      dispatch({ type: ACTIONS.ADD_TASK, payload: res.data.data });
      toast.success('Task created!');
      return res.data.data;
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  }, [dispatch]);

  const updateTask = useCallback(async (id, data) => {
    try {
      const res = await taskApi.update(id, data);
      dispatch({ type: ACTIONS.UPDATE_TASK, payload: res.data.data });
      toast.success('Task updated!');
      return res.data.data;
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  }, [dispatch]);

  const deleteTask = useCallback(async (id) => {
    try {
      await taskApi.delete(id);
      dispatch({ type: ACTIONS.DELETE_TASK, payload: id });
      toast.success('Task deleted.');
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  }, [dispatch]);

  return {
    tasks: state.tasks,
    loading: state.loading.tasks,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask,
  };
};
