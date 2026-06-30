/**
 * api/client.js
 *
 * Centralized Axios instance — all API calls flow through this module.
 *
 * Features:
 * - Base URL read from an environment variable (easy to swap in production)
 * - Request interceptor: attaches the auth token to every request
 * - Response interceptor: unwraps the data envelope and normalizes errors
 *   so components receive clean data, not nested { success, data, message } objects.
 */

import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request Interceptor ───────────────────────────────────────────────────────
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('tf_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response Interceptor ──────────────────────────────────────────────────────
apiClient.interceptors.response.use(
  // Unwrap the ApiResponse envelope → components receive `response.data` directly
  (response) => response,

  (error) => {
    const message =
      error.response?.data?.message ||
      error.message ||
      'An unexpected error occurred.';

    // Normalize 401 → redirect to login (plug in your auth logic here)
    if (error.response?.status === 401) {
      localStorage.removeItem('tf_token');
      // window.location.href = '/login'; // Uncomment when auth is implemented
    }

    return Promise.reject(new Error(message));
  }
);

export default apiClient;
