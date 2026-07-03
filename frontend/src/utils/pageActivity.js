import http from '../api/http';

let lastPath = '';
let lastAt = 0;

export function trackPageView(path, name = '') {
  if (!path || path.startsWith('/login')) return;
  const now = Date.now();
  if (path === lastPath && now - lastAt < 30000) return;
  lastPath = path;
  lastAt = now;
  http.post('/activity/page-view', { path, name }).catch(() => {});
}
