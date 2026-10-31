import axios from 'axios';

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '')
  || (import.meta.env.PROD ? 'https://subsight-backend-ahms.onrender.com' : '');
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
    let detail = error.response?.data;
    if (detail instanceof Blob) {
      try { detail = JSON.parse(await detail.text()); } catch { detail = null; }
    }
    const message = detail?.message || (error.code === 'ECONNABORTED' ? 'The server took too long to respond.' : 'Unable to reach the SubSight API. Check that the backend and database are running.');
    const failure = new Error(message);
    failure.status = error.response?.status;
    failure.cancelled = error.code === 'ERR_CANCELED';
    if (failure.status === 401 && localStorage.getItem('subsight-token') && !['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password'].includes(url)) {
      localStorage.removeItem('subsight-token');
      window.dispatchEvent(new Event('subsight:session-expired'));
    }
    throw failure;
  }
}

export async function requestAll(url, config = {}) {
  const separator = url.includes('?') ? '&' : '?';
  const first = await request('get', url + separator + 'page=1&limit=100', undefined, config);
  const items = [...(first.items || [])];
  for (let page = 2; page <= first.pages; page += 1) {
    const result = await request('get', url + separator + 'page=' + page + '&limit=100', undefined, config);
    items.push(...(result.items || []));
  }
  return items;
}

export async function downloadCsv(kind, params = {}) {
  const query = new URLSearchParams({ kind, ...params });
  const blob = await request('get', '/reports/export?' + query, undefined, { responseType: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'subsight-' + kind + '.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default api;
