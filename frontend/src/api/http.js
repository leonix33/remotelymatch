import axios from 'axios';
import { clearAuthStorage } from '../utils/authStorage';

const http = axios.create({ baseURL: '/api', withCredentials: true });

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (err) => {
    const path = window.location.pathname;
    const onAuthPage = ['/login', '/forgot-password', '/welcome'].some((p) => path.startsWith(p));
    const url = String(err.config?.url || '');
    const isAuthRequest =
      url.includes('/auth/login') ||
      url.includes('/auth/forgot-password') ||
      url.includes('/auth/reset-password');

    if (err.response?.status === 401 && !isAuthRequest && !onAuthPage) {
      let userId = null;
      try {
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        userId = user?.id;
      } catch {
        /* ignore */
      }
      clearAuthStorage(userId);
      if (!path.startsWith('/login') && !path.startsWith('/forgot-password')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default http;
