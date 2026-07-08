const env = require('../config/env');
const { enrichJobScores } = require('./jobs/jobQualityService');
const { filterQualityJobs } = require('./jobs/jobQualityGate');

/**
 * Source, salary, and geography gate — run before scoring.
 */
function applyJobPoolFilters(jobs = []) {
  if (!jobs.length) return [];
  const enriched = jobs.map((j) => enrichJobScores(j));
  if (env.usRemoteJobsOnly === false) return enriched;
  return filterQualityJobs(enriched, { minSalaryUsd: env.jobMinSalaryUsd });
}

/**
 * Callback-score gate — run after scoreJobsForProfile adds interviewLikelihoodPct.
 */
function filterByCallbackScore(jobs = [], options = {}) {
  const minCallback = options.minCallbackScore ?? env.jobMinCallbackScore ?? 25;
  if (env.qualityFirstMode === false) return jobs;

  return jobs
    .filter((job) => {
      const callback = job.interviewLikelihoodPct ?? 0;
      if (callback < minCallback) return false;
      if (job.recommendAction === 'skip_unless_strategic') return false;
      return true;
    })
    .sort(
      (a, b) =>
        (b.interviewLikelihoodPct || 0) - (a.interviewLikelihoodPct || 0) ||
        (b.personalMatchPct ?? b.matchPct ?? 0) - (a.personalMatchPct ?? a.matchPct ?? 0)
    );
}

function filterRecruiterQualityJobs(jobs = [], options = {}) {
  const pool = applyJobPoolFilters(jobs);
  return filterByCallbackScore(pool, options);
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
  callbackTierLabel,
};
