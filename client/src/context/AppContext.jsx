/**
 * context/AppContext.jsx
 *
 * Global state management via the Context API + useReducer pattern.
 *
 * Why useReducer over useState for global state?
 * - State transitions are explicit and traceable (action-based)
 * - Easier to reason about complex state logic
 * - Mirrors Redux patterns, making future migration straightforward if needed
 *
 * Structure:
 * - AppProvider wraps the entire app
 * - useApp() hook provides access to state + dispatch from any component
 * - Derived selectors are co-located for efficiency
 */

import { createContext, useContext, useReducer, useCallback } from 'react';

// ── Action Types ──────────────────────────────────────────────────────────────
export const ACTIONS = {
  // Workspaces
  SET_WORKSPACES:       'SET_WORKSPACES',
  ADD_WORKSPACE:        'ADD_WORKSPACE',
  UPDATE_WORKSPACE:     'UPDATE_WORKSPACE',
  DELETE_WORKSPACE:     'DELETE_WORKSPACE',
  SET_ACTIVE_WORKSPACE: 'SET_ACTIVE_WORKSPACE',

  // Projects
  SET_PROJECTS:     'SET_PROJECTS',
  ADD_PROJECT:      'ADD_PROJECT',
  UPDATE_PROJECT:   'UPDATE_PROJECT',
  DELETE_PROJECT:   'DELETE_PROJECT',
  SET_ACTIVE_PROJECT: 'SET_ACTIVE_PROJECT',

  // Tasks
  SET_TASKS:      'SET_TASKS',
  ADD_TASK:       'ADD_TASK',
  UPDATE_TASK:    'UPDATE_TASK',
  DELETE_TASK:    'DELETE_TASK',

  // UI
  SET_LOADING:  'SET_LOADING',
  SET_ERROR:    'SET_ERROR',
  CLEAR_ERROR:  'CLEAR_ERROR',
};

// ── Initial State ─────────────────────────────────────────────────────────────
const initialState = {
  workspaces:      [],
  projects:        [],
  tasks:           [],
  activeWorkspace: null,
  activeProject:   null,
  loading: {
    workspaces: false,
    projects:   false,
    tasks:      false,
  },
  error: null,
};

// ── Reducer ───────────────────────────────────────────────────────────────────
const appReducer = (state, action) => {
  switch (action.type) {
    // ── Workspaces
    case ACTIONS.SET_WORKSPACES:
      return { ...state, workspaces: action.payload };
    case ACTIONS.ADD_WORKSPACE:
      return { ...state, workspaces: [action.payload, ...state.workspaces] };
    case ACTIONS.UPDATE_WORKSPACE:
      return {
        ...state,
        workspaces: state.workspaces.map((w) =>
          w._id === action.payload._id ? action.payload : w
        ),
        // Also update activeWorkspace if it was the one modified
        activeWorkspace: state.activeWorkspace?._id === action.payload._id
          ? action.payload
          : state.activeWorkspace,
      };
    case ACTIONS.DELETE_WORKSPACE:
      return {
        ...state,
        workspaces: state.workspaces.filter((w) => w._id !== action.payload),
        activeWorkspace: state.activeWorkspace?._id === action.payload
          ? null
          : state.activeWorkspace,
      };
    case ACTIONS.SET_ACTIVE_WORKSPACE:
      return { ...state, activeWorkspace: action.payload, projects: [], tasks: [], activeProject: null };

    // ── Projects
    case ACTIONS.SET_PROJECTS:
      return { ...state, projects: action.payload };
    case ACTIONS.ADD_PROJECT:
      return { ...state, projects: [action.payload, ...state.projects] };
    case ACTIONS.UPDATE_PROJECT:
      return {
        ...state,
        projects: state.projects.map((p) =>
          p._id === action.payload._id ? action.payload : p
        ),
        activeProject: state.activeProject?._id === action.payload._id
          ? action.payload
          : state.activeProject,
      };
    case ACTIONS.DELETE_PROJECT:
      return {
        ...state,
        projects: state.projects.filter((p) => p._id !== action.payload),
        activeProject: state.activeProject?._id === action.payload ? null : state.activeProject,
        tasks: state.tasks.filter((t) => t.project?._id !== action.payload),
      };
    case ACTIONS.SET_ACTIVE_PROJECT:
      return { ...state, activeProject: action.payload, tasks: [] };

    // ── Tasks
    case ACTIONS.SET_TASKS:
      return { ...state, tasks: action.payload };
    case ACTIONS.ADD_TASK:
      return { ...state, tasks: [action.payload, ...state.tasks] };
    case ACTIONS.UPDATE_TASK:
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t._id === action.payload._id ? action.payload : t
        ),
      };
    case ACTIONS.DELETE_TASK:
      return {
        ...state,
        tasks: state.tasks.filter((t) => t._id !== action.payload),
      };

    // ── UI
    case ACTIONS.SET_LOADING:
      return { ...state, loading: { ...state.loading, ...action.payload } };
    case ACTIONS.SET_ERROR:
      return { ...state, error: action.payload };
    case ACTIONS.CLEAR_ERROR:
      return { ...state, error: null };

    default:
      return state;
  }
};

// ── Context ───────────────────────────────────────────────────────────────────
const AppContext = createContext(null);

// ── Provider ──────────────────────────────────────────────────────────────────
export const AppProvider = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Stable dispatch wrapper to prevent unnecessary re-renders
  const stableDispatch = useCallback(dispatch, []);

  return (
    <AppContext.Provider value={{ state, dispatch: stableDispatch }}>
      {children}
    </AppContext.Provider>
  );
};

// ── Custom Hook ───────────────────────────────────────────────────────────────
export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an <AppProvider>.');
  }
  return context;
};

// ── Derived Selectors ─────────────────────────────────────────────────────────
// Co-locate selectors with reducer for single source of truth
export const selectTasksByStatus = (tasks, status) =>
  tasks.filter((t) => t.status === status);

export const selectTasksByPriority = (tasks, priority) =>
  tasks.filter((t) => t.priority === priority);
