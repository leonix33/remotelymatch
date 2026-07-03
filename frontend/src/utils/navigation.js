import { showAskAi } from '../config';

/** Core interview workflow — simple 4-step mental model. */
export const simpleNav = [
  { to: '/', label: 'Apply', icon: '▶', exact: true },
  { to: '/approvals', label: 'Queue', icon: '✓' },
  { to: '/follow-ups', label: 'Follow-ups', icon: '↻' },
  { to: '/profile', label: 'Profile', icon: '◆' },
];

/** Optional extras — keep the main nav focused on getting interviews. */
const userMoreNavAll = [
  { to: '/jobs', label: 'Browse jobs', icon: '◎' },
  { to: '/concierge', label: 'Ask AI', icon: '✦', askAi: true },
  { to: '/tailored-resumes', label: 'Tailored resumes', icon: '📋' },
  { to: '/outcomes', label: 'Outcomes', icon: '📈' },
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
  const sections = [{ title: 'More', items: userMoreNav }];
  if (isAdmin) {
    sections.push({ title: 'Admin', items: adminNav, adminOnly: true });
  }
  return sections;
}

export const mobileMoreSections = moreNavSections;
