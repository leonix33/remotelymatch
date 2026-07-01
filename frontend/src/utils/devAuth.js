/**
 * Dev-only auto-login — never used in production builds.
 */

const DEV_CREDS_KEY = 'remotelymatch_dev_creds';

export function isLocalDevHost() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

export function devAutoLoginEnabled() {
  if (!import.meta.env.DEV || !isLocalDevHost()) return false;
  if (import.meta.env.VITE_DEV_AUTO_LOGIN === 'false') return false;
  return true;
}

export function shouldPersistDevCredentials() {
  return import.meta.env.DEV && isLocalDevHost();
}

export function devLoginEmail() {
  return String(import.meta.env.VITE_DEV_LOGIN_EMAIL || '').trim();
}

export function devLoginPassword() {
  return String(import.meta.env.VITE_DEV_LOGIN_PASSWORD || '');
}

export function rememberDevCredentials(email, password) {
  if (!import.meta.env.DEV || !isLocalDevHost()) return;
  try {
    localStorage.setItem(
      DEV_CREDS_KEY,
      JSON.stringify({
        email: String(email || '').trim().toLowerCase(),
        password: String(password || ''),
      })
    );
  } catch {
    /* ignore */
  }
}

export function recalledDevCredentials() {
  if (!import.meta.env.DEV || !isLocalDevHost()) return null;
  try {
    const raw = localStorage.getItem(DEV_CREDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.email || !parsed?.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function resolveDevCredentials() {
  if (!import.meta.env.DEV || !isLocalDevHost()) return null;
  if (import.meta.env.VITE_DEV_AUTO_LOGIN === 'false') {
    const recalled = recalledDevCredentials();
    return recalled ? { ...recalled, source: 'storage' } : null;
  }
  if (devLoginEmail() && devLoginPassword()) {
    return { email: devLoginEmail(), password: devLoginPassword(), source: 'env' };
  }
  const recalled = recalledDevCredentials();
  if (recalled) return { ...recalled, source: 'storage' };
  return null;
}

export async function tryDevAutoLogin(authStore) {
  if (!import.meta.env.DEV || !isLocalDevHost() || authStore.accessToken) return false;
  const creds = resolveDevCredentials();
  if (!creds?.email || !creds?.password) return false;
  try {
    await authStore.login(creds.email, creds.password);
    rememberDevCredentials(creds.email, creds.password);
    return true;
  } catch {
    return false;
  }
}
