/** Canonical public domain — keep in sync with render.yaml CUSTOM_DOMAIN / APP_URL */
const CANONICAL_DOMAIN = 'remotelymatch.app';
const CANONICAL_APP_URL = `https://${CANONICAL_DOMAIN}`;

/** Legacy / typo domains → 301 redirect to canonical */
const LEGACY_REDIRECT_HOSTS = new Set(['remotematch.app', 'www.remotematch.app']);

module.exports = {
  CANONICAL_DOMAIN,
  CANONICAL_APP_URL,
  LEGACY_REDIRECT_HOSTS,
};
