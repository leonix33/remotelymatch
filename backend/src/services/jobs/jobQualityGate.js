/**
 * Quality gate — only jobs from actionable sources at viable US pay levels.
 * Low-paying listings and thin/scraper boards are excluded from the user pool.
 */

const {
  isUsEligibleJob,
  isBlockedSource,
  inferSalaryCurrency,
  annotateJobLocation,
} = require('./jobLocationFilter');
const {
  hasEmployerAtsUrl,
  isVerifiedCompany,
  passesCompanyTrustGate,
  annotateEmployerTrust,
} = require('./companyTrustService');
const { isOversaturated } = require('./jobApplicantService');
const env = require('../../config/env');

/** Boards where postings link to real company apply pages (highest hire rate). */
const TIER1_ATS_SOURCES = ['greenhouse', 'lever', 'ashby'];

/** Curated remote boards with verified listings and direct apply links. */
const TIER2_REMOTE_BOARDS = ['remoteok', 'remotive', 'we work remotely', 'weworkremotely'];

/** API aggregators — kept only when geo + salary filters pass. */
const TIER3_AGGREGATORS = ['adzuna'];

const TRUSTED_SOURCES = [...TIER1_ATS_SOURCES, ...TIER2_REMOTE_BOARDS, ...TIER3_AGGREGATORS];

const BLOCKED_LOW_QUALITY_SOURCES = [
  'devitjobs',
  'arbeitnow',
  'jungle',
  'landing',
  'fourdayweek',
  'aijobs',
  'wellfound',
  'working nomads',
  'jobspresso',
  'jobicy',
  'himalayas',
  'robert half',
  'dice',
  'indeed',
  'y combinator',
  'work at a startup',
  'usajobs',
  'hn ',
  'hacker news',
];

const DAY_MS = 24 * 60 * 60 * 1000;

const SALARY_CONTEXT_RE =
  /salary|compensation|pay range|base pay|ote|total comp|annually|per year|\/yr|\/year|\$[\d,]+k?|\£[\d,]+|\€[\d,]+/i;

function normalize(text = '') {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ');
}

function sourceTier(source = '') {
  const s = normalize(source);
  if (TIER1_ATS_SOURCES.some((t) => s.includes(t))) return 1;
  if (TIER2_REMOTE_BOARDS.some((t) => s.includes(t))) return 2;
  if (TIER3_AGGREGATORS.some((t) => s.includes(t))) return 3;
  return 0;
}

function isTrustedSource(source = '') {
  const s = normalize(source);
  if (isBlockedSource(source)) return false;
  if (BLOCKED_LOW_QUALITY_SOURCES.some((b) => s.includes(b))) return false;
  return TRUSTED_SOURCES.some((t) => s.includes(t));
}

function hasDirectApplyUrl(job) {
  const url = (job.applyUrl || job.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return false;
  const lower = url.toLowerCase();
  // Reject search/listing pages that aren't a specific posting
  if (/[?&]q=|[?&]search=|\/search\?|\/jobs\?|\/job-search/i.test(lower)) return false;
  return true;
}

function effectivePostedAt(job) {
  const posted = job?.postedAt ? new Date(job.postedAt) : null;
  if (posted && !Number.isNaN(posted.getTime())) return posted;
  const seen = job?.firstSeen ? new Date(job.firstSeen) : null;
  if (seen && !Number.isNaN(seen.getTime())) return seen;
  const updated = job?.updatedAt ? new Date(job.updatedAt) : null;
  if (updated && !Number.isNaN(updated.getTime())) return updated;
  const created = job?.createdAt ? new Date(job.createdAt) : null;
  if (created && !Number.isNaN(created.getTime())) return created;
  return null;
}

function jobAgeDays(job) {
  const posted = effectivePostedAt(job);
  if (!posted) return null;
  return (Date.now() - posted.getTime()) / DAY_MS;
}

function isFreshEnough(job, maxAgeDays = 30) {
  if (!maxAgeDays || maxAgeDays <= 0) return true;
  const age = jobAgeDays(job);
  if (age == null) return false;
  return age <= maxAgeDays;
}

function parseSalaryFromText(text = '') {
  const blob = String(text || '');
  if (!SALARY_CONTEXT_RE.test(blob)) return null;

  const rangeMatch = blob.match(
    /\$\s?(\d{2,3}(?:,\d{3})+|\d{2,3})\s*k?\s*[-–—to]+\s*\$?\s?(\d{2,3}(?:,\d{3})+|\d{2,3})\s*k?/i
  );
  if (rangeMatch) {
    const toNum = (raw) => {
      const n = Number(String(raw).replace(/,/g, '').toLowerCase().replace(/k$/, ''));
      return String(raw).toLowerCase().endsWith('k') ? n * 1000 : n;
    };
    return { min: toNum(rangeMatch[1]), max: toNum(rangeMatch[2]), currency: 'USD' };
  }

  const gbpMatch = blob.match(/£\s?(\d{2,3}(?:,\d{3})+|\d{2,3})\s*k?/i);
  if (gbpMatch) {
    const raw = gbpMatch[1].replace(/,/g, '');
    const n = Number(raw);
    const val = gbpMatch[0].toLowerCase().includes('k') ? n * 1000 : n;
    return { min: val, max: val, currency: 'GBP' };
  }

  const usdSingle = blob.match(/\$\s?(\d{2,3}(?:,\d{3})+|\d{2,3})\s*k?/i);
  if (usdSingle) {
    const raw = usdSingle[1].replace(/,/g, '');
    const n = Number(raw);
    const val = usdSingle[0].toLowerCase().includes('k') ? n * 1000 : n;
    if (val >= 30000 && val <= 500000) return { min: val, max: val, currency: 'USD' };
  }

  return null;
}

function toUsd(amount, currency) {
  if (!amount) return 0;
  if (currency === 'GBP') return Math.round(amount * 1.27);
  if (currency === 'EUR') return Math.round(amount * 1.08);
  return amount;
}

function effectiveSalaryUsd(job) {
  const currency = job.salaryCurrency || inferSalaryCurrency(job) || 'USD';
  const parsed = parseSalaryFromText(job.description || '');
  const min = job.salaryMin ?? parsed?.min ?? null;
  const max = job.salaryMax ?? parsed?.max ?? min;
  if (min == null && max == null) return { known: false, maxUsd: null, minUsd: null };

  const jobCurrency = min != null && parsed?.currency ? parsed.currency : currency;
  return {
    known: true,
    minUsd: toUsd(min, jobCurrency),
    maxUsd: toUsd(max ?? min, jobCurrency),
    currency: jobCurrency,
  };
}

function meetsSalaryFloor(job, minUsd = 100000) {
  const salary = effectiveSalaryUsd(job);
  if (!salary.known) return null; // unknown — decide via source tier

  // Reject non-USD listed comp below floor (catches £55k etc.)
  if (salary.currency && salary.currency !== 'USD' && salary.maxUsd < minUsd) {
    return false;
  }
  if (salary.maxUsd < minUsd) return false;
  return true;
}

function isActionableJob(job, options = {}) {
  const relaxed = options.relaxed === true;
  const minSalaryUsd = options.minSalaryUsd ?? (relaxed ? 60000 : 140000);
  const requireTrustedSource = options.requireTrustedSource !== false && !relaxed;
  const maxAgeDays = options.maxAgeDays ?? 30;
  const aggregatorRequiresAts = options.aggregatorRequiresAts !== false;
  const requireDomainMatch = options.requireDomainMatch !== false && !relaxed;
  const maxApplicants = options.maxApplicants ?? env.jobMaxApplicants ?? 75;

  if (isOversaturated(job, maxApplicants)) return false;

  if (relaxed) {
    if (!job?.title?.trim() || !hasDirectApplyUrl(job)) return false;
    if (!isUsEligibleJob(job)) return false;
    if (!passesCompanyTrustGate(job, { requireDomainMatch: false })) return false;
    if (!isFreshEnough(job, maxAgeDays)) return false;
    return true;
  }

  if (!job?.title?.trim() || !job?.company?.trim()) return false;
  if (!hasDirectApplyUrl(job)) return false;
  if (!passesCompanyTrustGate(job, { requireDomainMatch })) return false;
  if (!isFreshEnough(job, maxAgeDays)) return false;
  if (requireTrustedSource && !isTrustedSource(job.source)) return false;
  if (!isUsEligibleJob(job)) return false;

  const tier = sourceTier(job.source);
  const descLen = (job.description || '').length;

  if (tier === 3 && aggregatorRequiresAts && !hasEmployerAtsUrl(job)) return false;
  if (tier >= 2 && jobAgeDays(job) == null && !relaxed) return false;

  const salaryOk = meetsSalaryFloor(job, minSalaryUsd);
  if (salaryOk === false) return false;

  // Known salary and passed floor
  if (salaryOk === true) return true;

  // No salary posted — only allow high-trust sources with substantive postings
  if (tier === 1) return descLen >= 80;
  if (tier === 2) return descLen >= 200 && (job.qualityScore ?? 0) >= 45;
  if (tier === 3) return descLen >= 300 && (job.qualityScore ?? 0) >= 50;

  return false;
}

function filterQualityJobs(jobs = [], options = {}) {
  return jobs.filter((job) => isActionableJob(job, options));
}

function annotateJobQuality(job) {
  const salary = effectiveSalaryUsd(job);
  return annotateEmployerTrust(
    annotateJobLocation({
      ...job,
      salaryCurrency: salary.currency || job.salaryCurrency || inferSalaryCurrency(job),
      salaryKnown: salary.known,
      effectiveSalaryMaxUsd: salary.maxUsd,
      sourceTier: sourceTier(job.source),
    })
  );
}

module.exports = {
  TRUSTED_SOURCES,
  TIER1_ATS_SOURCES,
  TIER2_REMOTE_BOARDS,
  isTrustedSource,
  isVerifiedCompany,
  isFreshEnough,
  jobAgeDays,
  hasEmployerAtsUrl,
  isActionableJob,
  meetsSalaryFloor,
  effectiveSalaryUsd,
  filterQualityJobs,
  annotateJobQuality,
  hasDirectApplyUrl,
};
