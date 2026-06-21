// Runs on RemoteMatch site only — receives credentials from Profile and saves to extension storage.
const ALLOWED = [
  'https://remotematch.onrender.com',
  'https://remotematch.app',
  'https://www.remotematch.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

if (ALLOWED.includes(window.location.origin)) {
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== 'REMOTEMATCH_EXT_CONFIG') return;
    const { apiBase, accessToken } = event.data;
    if (!apiBase || !accessToken) return;
    chrome.storage.sync.set({ apiBase, accessToken }, () => {
      window.postMessage({ type: 'REMOTEMATCH_EXT_CONFIGURED', ok: true }, window.location.origin);
    });
  });
}
