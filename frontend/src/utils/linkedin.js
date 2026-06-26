/** Human-in-the-loop LinkedIn helpers — opens searches in the user's browser, no scraping. */

export function buildLinkedInJobSearchUrl(keywords, options = {}) {
  const params = new URLSearchParams();
  params.set('keywords', keywords);
  params.set('location', options.location || 'United States');
  if (options.remote !== false) params.set('f_WT', '2');
  if (options.sortByDate !== false) params.set('sortBy', 'DD');
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

export function buildLinkedInSearchFromJob(job) {
  const title = (job?.title || 'remote').split('|')[0].trim();
  return buildLinkedInJobSearchUrl(title);
}

export function isLinkedInUrl(url = '') {
  return String(url).toLowerCase().includes('linkedin.com');
}

export function isLinkedInJob(job) {
  const url = job?.url || job?.jobUrl || '';
  const source = String(job?.source || '').toLowerCase();
  return isLinkedInUrl(url) || source.includes('linkedin') || source === 'chrome-extension';
}

export function defaultSearchesFromProfile(profile) {
  const titles = profile?.targetTitles?.length
    ? profile.targetTitles
    : ['remote'];
  return titles.slice(0, 10).map((title, index) => ({
    id: `builtin-${index}`,
    label: `${title} · remote`,
    url: buildLinkedInJobSearchUrl(title),
    builtin: true,
  }));
}

export function mergeLinkedInSearches(profile) {
  const saved = profile?.linkedinSavedSearches || [];
  const builtins = defaultSearchesFromProfile(profile);
  const custom = saved.filter((s) => s?.url && !s.builtin);
  const seen = new Set();
  const merged = [];
  for (const item of [...custom, ...builtins]) {
    const key = item.url;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

export function openLinkedIn(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}
