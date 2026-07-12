export function formatApiError(error, fallback = 'Request failed') {
  const message = error?.response?.data?.message;
  if (message) return message;

  const status = error?.response?.status;
  if (status === 502 || status === 504 || status === 524) {
    return 'Server timed out while polishing — try again; fewer passes should finish faster.';
  }
  if (error?.code === 'ECONNABORTED') {
    return 'Request timed out — the server may still be working. Wait a minute, then refresh.';
  }
  if (!error?.response) {
    return 'Network error — check your connection and try again.';
  }
  return fallback;
}
