import { CANONICAL_DOMAIN } from './constants/domain';

export const appName = import.meta.env.VITE_APP_NAME || 'remotelymatch';
export const appUrl = import.meta.env.VITE_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
export const canonicalDomain = import.meta.env.VITE_CUSTOM_DOMAIN || CANONICAL_DOMAIN;
export const isProduction = import.meta.env.PROD;
/** Ask AI concierge — hidden in production until re-enabled. */
export const showAskAi = import.meta.env.DEV || import.meta.env.VITE_SHOW_ASK_AI === '1';
