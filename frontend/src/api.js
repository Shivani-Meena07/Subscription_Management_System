import axios from 'axios';

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '');
const apiBaseURL = configuredApiUrl
  ? `${configuredApiUrl}${configuredApiUrl.endsWith('/api') ? '' : '/api'}`
  : '/api';
const api = axios.create({ baseURL: apiBaseURL, timeout: 15000 });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('subsight-token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function request(method, url, data, config) {
  try {
    const response = await api.request({ method, url, data, ...config });
    return response.data;
  } catch (error) {
    const message = error.response?.data?.message || (error.code === 'ECONNABORTED' ? 'The server took too long to respond.' : 'Unable to reach the SubSight API. Check that the backend and database are running.');
    throw new Error(message);
  }
}

export default api;
