import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTasks } from './useTasks.js';
import { AppProvider } from '../context/AppContext.jsx';
import { taskApi } from '../api/index.js';

// Mock the API client functions
vi.mock('../api/index.js', () => ({
  taskApi: {
    getByProject: vi.fn(),
    create: vi.fn(),
  }
}));

describe('useTasks Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const wrapper = ({ children }) => <AppProvider>{children}</AppProvider>;

  it('fetchTasks updates the context tasks and loading state', async () => {
    const mockTasksResponse = {
      data: {
        data: {
          tasks: [{ _id: '1', title: 'Test Task' }]
        }
      }
    };
    taskApi.getByProject.mockResolvedValueOnce(mockTasksResponse);

    const { result } = renderHook(() => useTasks(), { wrapper });

    // Initially loading is falsy and tasks are empty
    expect(result.current.loading).toBeFalsy();
    expect(result.current.tasks).toEqual([]);

    // Call fetchTasks within act since it triggers immediate synchronous state updates (loading: true)
    act(() => {
      result.current.fetchTasks('req-proj-id');
    });

    // Wait for the async state to settle
    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(1);
    });

    expect(result.current.tasks[0].title).toBe('Test Task');
    expect(taskApi.getByProject).toHaveBeenCalledWith('req-proj-id', {});
    expect(result.current.loading).toBe(false);
  });

  it('createTask adds a task and resolves the data', async () => {
    const newTask = { _id: '2', title: 'New Task' };
    taskApi.create.mockResolvedValueOnce({ data: { data: newTask } });

    const { result } = renderHook(() => useTasks(), { wrapper });

    let createdTask;
    await waitFor(async () => {
      createdTask = await result.current.createTask({ title: 'New Task' });
    });

    // Check context was updated
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].title).toBe('New Task');
    expect(createdTask).toEqual(newTask);
    expect(taskApi.create).toHaveBeenCalledWith({ title: 'New Task' });
  });

});
