/**
 * Geographic eligibility for job listings — mirrors Python utils/profile.py logic.
 * Blocks UK/EU-only roles and unreliable international boards from the user pool.
 */

const US_REMOTE_HINTS = [
  'united states',
  'usa',
  'u.s.',
  ' us ',
  ' us,',
  ' us)',
  'north america',
  'americas',
  'pst',
  'est',
  'cst',
  'mst',
];

const WORLDWIDE_HINTS = ['worldwide', 'global', 'anywhere', 'work from anywhere'];

const INTERNATIONAL_ONLY_HINTS = [
  'uk only',
  'united kingdom only',
  'europe only',
  'eu only',
  'emea only',
  'canada only',
  'canadian only',
  'australia only',
  'india only',
  'poland only',
  'germany only',
  'serbia only',
  'mexico only',
  'spain only',
  'finland only',
  'brazil only',
  'latam only',
];

const INTERNATIONAL_LOCATION_MARKERS = [
  ', uk',
  ' uk',
  'united kingdom',
  'poland',
  'serbia',
  'germany',
  'mexico',
  'spain',
  'finland',
  'brazil',
  'india',
  'canada',
  'australia',
  'netherlands',
  'france',
  'italy',
  'portugal',
  'ireland',
  'sweden',
  'norway',
  'denmark',
  'switzerland',
  'belgium',
  'austria',
  'czech',
  'hungary',
  'romania',
  'london',
  'manchester',
  'birmingham',
  'edinburgh',
  'glasgow',
  'berlin',
  'amsterdam',
  'paris',
  'dublin',
  'zurich',
];

const BLOCKED_SOURCES = new Set([
  'devitjobs uk',
  'arbeitnow',
  'landing.jobs',
  'landingjobs',
  'welcome to the jungle',
  'jungle',
]);

const GBP_SOURCE_MARKERS = ['devitjobs', 'reed', 'totaljobs', 'cv-library', 'arbeitnow'];

function normalize(text = '') {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ');
}

function jobText(job) {
  return normalize(`${job.location || ''} ${job.title || ''} ${job.description || ''} ${job.company || ''}`);
}

function classifyLocationRegion(location = '', description = '') {
  const text = normalize(`${location} ${description}`);
  if (US_REMOTE_HINTS.some((term) => text.includes(term))) return 'us';
  if (WORLDWIDE_HINTS.some((term) => text.includes(term))) return 'worldwide';
  if (INTERNATIONAL_ONLY_HINTS.some((term) => text.includes(term))) return 'international';
  if (INTERNATIONAL_LOCATION_MARKERS.some((marker) => text.includes(marker))) {
    if (text.includes('remote') && !US_REMOTE_HINTS.some((term) => text.includes(term))) {
      return 'international';
    }
  }
  if (text.includes('remote') || text.includes('work from home') || text.includes('wfh')) {
    return 'unknown';
  }
  return 'international';
}

function isBlockedSource(source = '') {
  const s = normalize(source);
  return [...BLOCKED_SOURCES].some((blocked) => s.includes(blocked));
}

function inferSalaryCurrency(job) {
  const text = normalize(`${job.description || ''} ${job.salaryText || ''} ${job.location || ''}`);
  const source = normalize(job.source || '');
  if (text.includes('£') || text.includes('gbp') || GBP_SOURCE_MARKERS.some((m) => source.includes(m))) {
    return 'GBP';
  }
  if (text.includes('€') || text.includes('eur')) return 'EUR';
  if (text.includes('$') || text.includes('usd')) return 'USD';
  if (US_REMOTE_HINTS.some((term) => text.includes(term))) return 'USD';
  return null;
}

function isUsEligibleJob(job, { allowWorldwide = true } = {}) {
  if (!job?.title) return false;

  if (isBlockedSource(job.source)) return false;

  const text = jobText(job);
  if (!text.includes('remote') && !text.includes('work from home') && !text.includes('wfh') && job.remoteType !== 'remote' && job.remoteType !== 'worldwide') {
    if (job.remoteType === 'onsite' || job.remoteType === 'hybrid') return false;
    if (!text.includes('distributed')) return false;
  }

  const region = job.locationRegion || classifyLocationRegion(job.location, job.description);
  if (region === 'international') return false;
  if (region === 'us') return true;
  if (region === 'worldwide' && allowWorldwide) return true;

  // Unknown remote — allow US-trusted sources; block EU-heavy boards
  const source = normalize(job.source || '');
  const trustedGlobal = [
    'remoteok',
    'remotive',
    'we work remotely',
    'weworkremotely',
    'jobicy',
    'himalayas',
    'greenhouse',
    'lever',
    'ashby',
    'dice',
    'adzuna',
    'usajobs',
    'y combinator',
    'work at a startup',
    'robert half',
    'working nomads',
    'jobspresso',
  ];
  if (trustedGlobal.some((t) => source.includes(t))) return true;

  return false;
}

function filterUsRemoteJobs(jobs = [], options = {}) {
  return jobs.filter((job) => isUsEligibleJob(job, options));
}

function annotateJobLocation(job) {
  const region = classifyLocationRegion(job.location, job.description);
  const currency = inferSalaryCurrency(job);
  return {
    ...job,
    locationRegion: region,
    salaryCurrency: currency || job.salaryCurrency || null,
  };
}

module.exports = {
  classifyLocationRegion,
  isUsEligibleJob,
  isBlockedSource,
  inferSalaryCurrency,
  filterUsRemoteJobs,
  annotateJobLocation,
};
