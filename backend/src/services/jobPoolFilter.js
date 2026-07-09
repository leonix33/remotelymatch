const env = require('../config/env');
const { enrichJobScores } = require('./jobs/jobQualityService');
const { filterQualityJobs } = require('./jobs/jobQualityGate');

function isRelaxed(options = {}) {
  return options.relaxed === true || env.qualityFirstMode === false;
}

function qualityFilterOptions(options = {}) {
  return {
    minSalaryUsd: isRelaxed(options) ? 60000 : env.jobMinSalaryUsd,
    relaxed: isRelaxed(options),
    maxAgeDays: options.maxAgeDays ?? env.jobMaxAgeDays ?? 30,
    aggregatorRequiresAts: options.aggregatorRequiresAts ?? env.jobAggregatorRequiresAts !== false,
    requireDomainMatch:
      options.requireDomainMatch ?? (env.jobRequireDomainMatch !== false && !isRelaxed(options)),
  };
}

/**
 * Source, salary, and geography gate — run before scoring.
 */
function applyJobPoolFilters(jobs = [], options = {}) {
  if (!jobs.length) return [];
  const enriched = jobs.map((j) => enrichJobScores(j));
  if (env.usRemoteJobsOnly === false) return enriched;
  return filterQualityJobs(enriched, qualityFilterOptions(options));
}

/**
 * Callback-score gate — run after scoreJobsForProfile adds interviewLikelihoodPct.
 */
function filterByCallbackScore(jobs = [], options = {}) {
  if (isRelaxed(options)) return jobs;

  const minCallback = options.minCallbackScore ?? env.jobMinCallbackScore ?? 25;

  return jobs
    .filter((job) => {
      const callback = job.interviewLikelihoodPct ?? 0;
      if (callback < minCallback) return false;
      if (job.recommendAction === 'skip_unless_strategic') return false;
      return true;
    })
    .sort(
      (a, b) =>
        (b.freshnessScore || 0) - (a.freshnessScore || 0) ||
        (b.interviewLikelihoodPct || 0) - (a.interviewLikelihoodPct || 0) ||
        (b.personalMatchPct ?? b.matchPct ?? 0) - (a.personalMatchPct ?? a.matchPct ?? 0)
    );
}

function filterRecruiterQualityJobs(jobs = [], options = {}) {
  const pool = applyJobPoolFilters(jobs, options);
  return filterByCallbackScore(pool, options);
}

function poolOptionsForProfile(profile = {}) {
  const relaxed = !profile.onboardingComplete;
  return {
    relaxed,
    minCallbackScore: relaxed ? 0 : profile.minCallbackScore,
  };
}

function callbackTierLabel(pct = 0) {
  if (pct >= 40) return 'Strong callback signal';
  if (pct >= 25) return 'Good callback signal';
  if (pct >= 15) return 'Moderate callback signal';
  return 'Low callback signal';
}

module.exports = {
  applyJobPoolFilters,
  filterByCallbackScore,
  filterRecruiterQualityJobs,
  poolOptionsForProfile,
  callbackTierLabel,
};
