export const appName = import.meta.env.VITE_APP_NAME || 'remotelymatch';
export const appUrl = import.meta.env.VITE_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
export const canonicalDomain = import.meta.env.VITE_CUSTOM_DOMAIN || 'remotelymatch.app';
export const isProduction = import.meta.env.PROD;
