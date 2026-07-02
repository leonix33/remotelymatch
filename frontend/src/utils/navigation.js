import { showAskAi } from '../config';

/** Core quality-first workflow — everyone sees these. */
export const simpleNav = [
  { to: '/', label: 'Apply', icon: '▶', exact: true },
  { to: '/jobs', label: 'Jobs', icon: '◎' },
  { to: '/approvals', label: 'My Queue', icon: '✓' },
  { to: '/follow-ups', label: 'Follow-ups', icon: '↻' },
  { to: '/profile', label: 'Profile', icon: '◆' },
];

/** Optional extras for normal users — keep the sidebar simple. */
const userMoreNavAll = [
  { to: '/concierge', label: 'Ask AI', icon: '✦', askAi: true },
  { to: '/tailored-resumes', label: 'Tailored resumes', icon: '📋' },
  { to: '/interview', label: 'Interview prep', icon: '🎙' },
];

export const userMoreNav = userMoreNavAll.filter((item) => !item.askAi || showAskAi);

/** Workspace operations — admins only. */
export const adminNav = [
  { to: '/users', label: 'Team', icon: '◇' },
  { to: '/agent', label: 'Run agent', icon: '⚡' },
  { to: '/monitor', label: 'Monitor', icon: '◈' },
  { to: '/analytics', label: 'Analytics', icon: '◈' },
];

export function moreNavSections(isAdmin) {
  const sections = [{ title: 'Helpful tools', items: userMoreNav }];
  if (isAdmin) {
    sections.push({ title: 'Admin', items: adminNav, adminOnly: true });
  }
  return sections;
}

export const mobileMoreSections = moreNavSections;
