/**
 * Company trust — staffing blocklists, apply-domain verification, employer labels.
 */

const PLACEHOLDER_COMPANY_RE =
  /^(unknown|see posting|see post|n\/a|na|confidential|company name|tbd|various|not specified|undisclosed|your company)$/i;

const DIRECT_ATS_TYPES = new Set([
  'greenhouse',
  'lever',
  'ashby',
  'workday',
  'icims',
  'jobvite',
  'smartrecruiters',
  'bamboohr',
]);

const EMPLOYER_ATS_HOSTS = [
  'greenhouse.io',
  'lever.co',
  'jobs.lever.co',
  'ashbyhq.com',
  'myworkdayjobs.com',
  'workday.com',
  'icims.com',
  'jobvite.com',
  'smartrecruiters.com',
  'bamboohr.com',
  'taleo.net',
  'ultipro.com',
  'paylocity.com',
  'recruiting.adp.com',
];

const STAFFING_COMPANY_HINTS = [
  'robert half',
  'randstad',
  'adecco',
  'manpower',
  'kelly services',
  'teksystems',
  'aerotek',
  'insight global',
  'apex systems',
  'motion recruitment',
  'cybercoders',
  'talent solutions',
  'staffing agency',
  'recruitment agency',
  'kforce',
  'hays',
  'modis',
  'experis',
  'collabera',
  'infosys',
  'wipro',
  'tata consultancy',
  'accenture federal',
  'deloitte consulting',
  'pwc',
  'michael page',
  'pagegroup',
  'lhh',
  'lee hecht harrison',
  'spherion',
  'express employment',
  'appleone',
  'pridestaff',
  'atrium staff',
  'vitamin t',
  'creative circle',
  'aquent',
  'on assignment',
  'allegis group',
  'actalent',
  'bcforward',
  'gdh consulting',
  'procom',
  'tundra technical',
  'toptal',
  'gun.io',
  'catalyte',
];

const STAFFING_DOMAINS = [
  'roberthalf.com',
  'randstad.com',
  'adecco.com',
  'manpower.com',
  'kellyservices.com',
  'teksystems.com',
  'aerotek.com',
  'insightglobal.com',
  'cybercoders.com',
  'apexsystems.com',
  'hays.com',
  'kforce.com',
  'modis.com',
  'experis.com',
  'collabera.com',
  'michaelpage.com',
  'lhhworldwide.com',
  'spherion.com',
  'expresspros.com',
  'pridestaff.com',
  'aquent.com',
  'creativecircle.com',
  'bcforward.com',
  'procomservices.com',
  'toptal.com',
  'gun.io',
  'lhh.com',
  'page.com',
];

const COMPANY_NOISE_WORDS =
  /\b(inc|llc|ltd|corp|corporation|company|co|group|technologies|technology|tech|systems|solutions|services|international|global|the|and|of)\b/gi;

function normalize(text = '') {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function compactKey(text = '') {
  return normalize(text).replace(COMPANY_NOISE_WORDS, ' ').replace(/[^a-z0-9]/g, '');
}

function titleCaseSlug(slug = '') {
  return String(slug)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function hasEmployerAtsUrl(job = {}) {
  const ats = normalize(job.atsType || '');
  if (DIRECT_ATS_TYPES.has(ats)) return true;
  const url = (job.applyUrl || job.url || '').toLowerCase();
  return EMPLOYER_ATS_HOSTS.some((host) => url.includes(host));
}

function isStaffingCompany(company = '') {
  const c = normalize(company);
  if (!c) return false;
  return STAFFING_COMPANY_HINTS.some((hint) => c.includes(hint));
}

function isStaffingDomain(hostname = '') {
  const host = normalize(hostname).replace(/^www\./, '');
  return STAFFING_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function parseApplyUrl(url = '') {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function extractEmployerSlug(url = '') {
  const parsed = parseApplyUrl(url);
  if (!parsed) return null;

  const host = parsed.hostname.toLowerCase();
  const parts = parsed.pathname.split('/').filter(Boolean);

  if (host.includes('greenhouse.io') && parts[0]) return parts[0];
  if (host.includes('lever.co') && parts[0] && parts[0] !== 'jobs') return parts[0];
  if (host.includes('jobs.lever.co') && parts[0]) return parts[0];
  if (host.includes('ashbyhq.com') && parts[0] === 'company' && parts[1]) return parts[1];
  if (host.includes('myworkdayjobs.com') && parts[0]) return parts[0];

  return null;
}

function domainRoot(hostname = '') {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  const parts = host.split('.').filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] || '';
}

function tokensShareIdentity(companyKey, otherKey) {
  if (!companyKey || !otherKey) return false;
  if (companyKey === otherKey) return true;
  if (companyKey.includes(otherKey) || otherKey.includes(companyKey)) return true;

  const minLen = Math.min(companyKey.length, otherKey.length);
  if (minLen >= 4 && companyKey.slice(0, 4) === otherKey.slice(0, 4)) return true;

  return false;
}

/**
 * Returns true (match), false (mismatch/staffing), or null (inconclusive).
 */
function companyDomainMatches(job = {}) {
  const company = normalize(job.company || '');
  const url = job.applyUrl || job.url || '';
  if (!company || !url) return null;

  const parsed = parseApplyUrl(url);
  if (!parsed) return null;

  if (isStaffingDomain(parsed.hostname)) return false;

  const companyKey = compactKey(company);
  if (!companyKey || companyKey.length < 2) return false;

  const slug = extractEmployerSlug(url);
  const slugKey = slug ? compactKey(slug) : '';
  const rootKey = compactKey(domainRoot(parsed.hostname));

  if (slugKey && tokensShareIdentity(companyKey, slugKey)) return true;

  const ats = normalize(job.atsType || '');
  if (DIRECT_ATS_TYPES.has(ats)) {
    if (slugKey) return tokensShareIdentity(companyKey, slugKey);
    return null;
  }

  if (hasEmployerAtsUrl(job)) {
    return companyDomainMatches({ ...job, atsType: ats && ats !== 'unknown' ? ats : 'greenhouse' });
  }

  if (rootKey && tokensShareIdentity(companyKey, rootKey)) return true;

  const boardHosts = ['remoteok.com', 'remotive.com', 'weworkremotely.com', 'adzuna.com'];
  if (boardHosts.some((h) => parsed.hostname.includes(h))) return null;

  return null;
}

function isVerifiedCompany(job = {}) {
  const company = normalize(job.company || '').trim();
  if (!company || company.length < 2) return false;
  if (PLACEHOLDER_COMPANY_RE.test(company)) return false;
  if (isStaffingCompany(company)) return false;

  const parsed = parseApplyUrl(job.applyUrl || job.url || '');
  if (parsed && isStaffingDomain(parsed.hostname)) return false;

  return true;
}

function isDirectEmployer(job = {}) {
  const ats = normalize(job.atsType || '');
  if (DIRECT_ATS_TYPES.has(ats)) return true;
  const parsed = parseApplyUrl(job.applyUrl || '');
  return hasEmployerAtsUrl(job) && !(parsed && isStaffingDomain(parsed.hostname));
}

function postedAgeLabel(job = {}) {
  const posted = job.postedAt ? new Date(job.postedAt) : job.firstSeen ? new Date(job.firstSeen) : null;
  if (!posted || Number.isNaN(posted.getTime())) return null;

  const days = Math.floor((Date.now() - posted.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted 1d ago';
  if (days < 7) return `Posted ${days}d ago`;
  if (days < 14) return 'Posted this week';
  if (days < 30) return `Posted ${Math.floor(days / 7)}w ago`;
  return 'Posted 30d+ ago';
}

function employerTrustLabel(job = {}) {
  if (isDirectEmployer(job)) return 'Direct employer';
  if (normalize(job.source || '').includes('adzuna') && hasEmployerAtsUrl(job)) return 'Employer ATS';
  if (['remoteok', 'remotive', 'weworkremotely', 'we work remotely'].some((s) => normalize(job.source).includes(s))) {
    return 'Verified board';
  }
  return null;
}

function annotateEmployerTrust(job = {}) {
  return {
    ...job,
    isDirectEmployer: isDirectEmployer(job),
    employerTrustLabel: employerTrustLabel(job),
    postedAgeLabel: postedAgeLabel(job),
    companyDomainVerified: companyDomainMatches(job),
  };
}

function passesCompanyTrustGate(job = {}, options = {}) {
  if (!isVerifiedCompany(job)) return false;

  const requireDomainMatch = options.requireDomainMatch !== false;
  if (!requireDomainMatch) return true;

  const domainMatch = companyDomainMatches(job);
  if (domainMatch === false) return false;

  const tierSource = normalize(job.source || '');
  if (['greenhouse', 'lever', 'ashby'].some((t) => tierSource.includes(t)) && domainMatch === false) {
    return false;
  }

  if (tierSource.includes('adzuna') && domainMatch !== true) return false;

  return true;
}

module.exports = {
  STAFFING_COMPANY_HINTS,
  STAFFING_DOMAINS,
  EMPLOYER_ATS_HOSTS,
  titleCaseSlug,
  hasEmployerAtsUrl,
  isStaffingCompany,
  isStaffingDomain,
  companyDomainMatches,
  isVerifiedCompany,
  isDirectEmployer,
  postedAgeLabel,
  employerTrustLabel,
  annotateEmployerTrust,
  passesCompanyTrustGate,
};
