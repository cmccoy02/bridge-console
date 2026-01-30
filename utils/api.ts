// API utility for making authenticated requests
// Handles cross-domain auth by including Authorization header

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const AUTH_TOKEN_KEY = 'bridge_auth_token';

// Get stored auth token
export const getStoredToken = (): string | null => {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
};

// Get auth headers for API calls
export const getAuthHeaders = (): Record<string, string> => {
  const token = getStoredToken();
  if (token) {
    return { 'Authorization': `Bearer ${token}` };
  }
  return {};
};

// Authenticated fetch wrapper
export const apiFetch = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;
  
  const headers = {
    ...getAuthHeaders(),
    ...options.headers
  };

  return fetch(url, {
    ...options,
    credentials: 'include',
    headers
  });
};

// Convenience methods
export const apiGet = (endpoint: string) => apiFetch(endpoint);

export const apiPost = (endpoint: string, body?: unknown) => 
  apiFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });

export const apiPut = (endpoint: string, body?: unknown) =>
  apiFetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });

export const apiDelete = (endpoint: string) =>
  apiFetch(endpoint, { method: 'DELETE' });

export { API_URL };
