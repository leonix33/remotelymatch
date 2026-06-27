export const appName = import.meta.env.VITE_APP_NAME || 'remotelymatch';
export const appUrl = import.meta.env.VITE_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
export const canonicalDomain = import.meta.env.VITE_CUSTOM_DOMAIN || 'remotelymatch.app';
export const isProduction = import.meta.env.PROD;

export const brand = {
  name: import.meta.env.VITE_APP_NAME || 'remotelymatch',
  nameTop: import.meta.env.VITE_BRAND_NAME_TOP || 'remotely',
  nameBottom: import.meta.env.VITE_BRAND_NAME_BOTTOM || 'match',
  tagline: import.meta.env.VITE_BRAND_TAGLINE || 'AI-powered remote job intelligence',
  heroEyebrow: import.meta.env.VITE_BRAND_HERO_EYEBROW || 'All remote roles · any industry',
  heroTitle: import.meta.env.VITE_BRAND_HERO_TITLE || 'Find roles. Review matches. Apply as a squad.',
  heroSubtitle:
    import.meta.env.VITE_BRAND_HERO_SUBTITLE ||
    'Your job agent, AI coach, approval queue, and team chat — so you only auto-apply to roles you have approved.',
  domain:
    import.meta.env.VITE_CUSTOM_DOMAIN ||
    (typeof window !== 'undefined' ? window.location.host : 'remotelymatch.app'),
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL || 'leonix23@gmail.com',
  accent: import.meta.env.VITE_BRAND_ACCENT || 'teal',
  colors: {
    slate: '#0f172a',
    slateMuted: '#1e293b',
    teal: '#14b8a6',
    tealLight: '#2dd4bf',
    gold: '#f59e0b',
    goldLight: '#fbbf24',
  },
};

export function displayDomain() {
  return brand.domain.replace(/^https?:\/\//, '');
}
