const { freshnessScore } = require('./jobs/jobQualityService');
const {
  getConversionContext,
  companyJobCounts,
  DEFAULT_REPLY_RATE,
} = require('./conversionStatsService');
const { applicantCountPoints } = require('./jobs/jobApplicantService');
const { repostPenaltyPoints } = require('./jobs/jobRepostService');
const { sourceLearningPoints, isLowYieldSource } = require('./jobs/sourceLearningService');
const env = require('../config/env');

const US_REMOTE_HINTS = [
  'united states',
  'usa',
  'u.s.',
  'us remote',
  'remote us',
  'north america',
  'anywhere in the us',
];

const INTL_ONLY_HINTS = [
  'uk only',
  'europe only',
  'eu only',
  'canada only',
  'india only',
];

function normalize(text = '') {
  return String(text).toLowerCase();
}

function atsReplyBoost(atsType = '') {
  const ats = normalize(atsType);
  if (ats === 'greenhouse') return 16;
  if (ats === 'lever') return 14;
  if (ats === 'ashby') return 14;
  if (ats === 'unknown' || !ats) return 6;
  return 8;
}

function remoteUsFitScore(job, profile) {
  const blob = normalize(`${job.location} ${job.title} ${job.url} ${job.description || ''}`);
  let score = 0;
  const factors = [];

  if (/remote|anywhere|distributed|work from home/.test(blob)) {
    score += 10;
    factors.push('Remote-friendly posting');
  }
  if (US_REMOTE_HINTS.some((h) => blob.includes(h))) {
    score += 8;
    factors.push('US remote signal');
  } else if (!INTL_ONLY_HINTS.some((h) => blob.includes(h))) {
    score += 4;
  } else {
    score -= 6;
    factors.push('Possible location restriction');
  }

  if (profile?.locations?.us_remote_required_for_auto_apply !== false && score < 8) {
    score -= 4;
  }

  return { score: Math.max(-8, Math.min(18, score)), factors };
}

function freshnessPoints(job) {
  const postedAt = job.postedAt || job.firstSeen;
  const fresh = job.freshnessScore ?? freshnessScore(postedAt);
  if (fresh >= 100) return { points: 18, label: 'Posted within 24h' };
  if (fresh >= 75) return { points: 14, label: 'Posted this week' };
  if (fresh >= 50) return { points: 8, label: 'Posted this month' };
  return { points: 3, label: 'Older posting' };
}

function companySaturationPoints(company, companyCounts, maxRoles = 5) {
  const key = normalize(company);
  const count = companyCounts[key] || 0;
  if (count > maxRoles) return { points: -10, label: `${count} similar roles — likely saturated` };
  if (count === maxRoles) return { points: -4, label: 'Many open roles at company' };
  if (count >= 3) return { points: 2, label: 'Active hiring at company' };
  return { points: 4, label: 'Focused opening' };
}

function sourceConversionPoints(job, context) {
  const key = normalize(job.source);
  const rate = context.sourceReplyRates[key] ?? context.userReplyRate ?? DEFAULT_REPLY_RATE;
  const learning = sourceLearningPoints(job, context);
  const points = Math.round(rate * 100) + learning.points;
  const pct = Math.round(rate * 100);
  const label =
    context.sampleSize >= 5
      ? learning.label || `Your ${pct}% reply rate on ${job.source || 'this source'}`
      : `Typical ${Math.round(DEFAULT_REPLY_RATE * 100)}% baseline for this source`;
  return { points: Math.min(22, Math.max(0, points)), rate, label, lowYield: learning.lowYield };
}

function likelihoodTier(pct) {
  if (pct >= 40) return 'high';
  if (pct >= 25) return 'good';
  if (pct >= 15) return 'moderate';
  return 'low';
}

function computeInterviewLikelihood(job, profile, context = {}, companyCounts = {}) {
  const matchPct = job.personalMatchPct ?? job.matchPct ?? 0;
  const factors = [];

  let score = Math.round(matchPct * 0.38);
  factors.push({ key: 'skill_match', impact: Math.round(matchPct * 0.38), label: `${matchPct}% profile match` });

  const fresh = freshnessPoints(job);
  score += fresh.points;
  factors.push({ key: 'freshness', impact: fresh.points, label: fresh.label });

  const atsBoost = atsReplyBoost(job.atsType);
  score += atsBoost;
  if (job.atsType && job.atsType !== 'unknown') {
    factors.push({ key: 'ats', impact: atsBoost, label: `Direct ${job.atsType} apply path` });
  }

  const remote = remoteUsFitScore(job, profile);
  score += remote.score;
  for (const f of remote.factors) {
    factors.push({ key: 'remote', impact: remote.score, label: f });
  }

  const saturation = companySaturationPoints(job.company, companyCounts, env.jobMaxSameCompanyRoles);
  score += saturation.points;
  factors.push({ key: 'saturation', impact: saturation.points, label: saturation.label });

  const applicants = applicantCountPoints(job, env.jobMaxApplicants);
  score += applicants.points;
  if (applicants.label) {
    factors.push({ key: 'applicants', impact: applicants.points, label: applicants.label });
  }

  const repost = repostPenaltyPoints(job);
  score += repost.points;
  if (repost.label) {
    factors.push({ key: 'repost', impact: repost.points, label: repost.label });
  }

  const source = sourceConversionPoints(job, context);
  score += source.points;
  factors.push({ key: 'conversion', impact: source.points, label: source.label });

  if ((job.qualityScore || 0) >= 60) {
    score += 4;
    factors.push({ key: 'quality', impact: 4, label: 'Rich job listing' });
  }

  const salaryMax = job.effectiveSalaryMaxUsd ?? job.salaryMax ?? null;
  if (salaryMax && salaryMax >= 140000) {
    score += 8;
    factors.push({ key: 'comp', impact: 8, label: 'Strong compensation ($140k+)' });
  } else if (salaryMax && salaryMax >= 100000) {
    score += 4;
    factors.push({ key: 'comp', impact: 4, label: 'Solid compensation ($100k+)' });
  }

  if (['greenhouse', 'lever', 'ashby'].includes(job.atsType) || job.isDirectEmployer) {
    score += 6;
    factors.push({ key: 'direct_apply', impact: 6, label: 'Direct company ATS — recruiters see your app' });
  }

  const interviewLikelihoodPct = Math.min(95, Math.max(5, Math.round(score)));
  const lowYield = source.lowYield || isLowYieldSource(job.source, context);

  return {
    interviewLikelihoodPct,
    likelihoodTier: likelihoodTier(interviewLikelihoodPct),
    likelihoodFactors: factors.slice(0, 10),
    recommendAction:
      applicants.oversaturated || lowYield
        ? 'skip_unless_strategic'
        : interviewLikelihoodPct >= 35
          ? 'approve'
          : interviewLikelihoodPct >= 25
            ? 'review'
            : 'skip_unless_strategic',
    saturationLabel: job.saturationLabel || saturation.label,
    lowYieldSource: lowYield,
  };
}

function enrichJobWithLikelihood(job, profile, context, companyCounts) {
  const likelihood = computeInterviewLikelihood(job, profile, context, companyCounts);
  return { ...job, ...likelihood };
}

function enrichJobsWithLikelihood(jobs, profile, userId) {
  const context = userId
    ? getConversionContext(userId)
    : { sourceReplyRates: {}, sourceStats: {}, userReplyRate: DEFAULT_REPLY_RATE, sampleSize: 0 };
  const companyCounts = companyJobCounts(jobs);
  return jobs
    .map((j) => enrichJobWithLikelihood(j, profile, context, companyCounts))
    .sort(
      (a, b) =>
        (b.freshnessScore || 0) - (a.freshnessScore || 0) ||
        (b.interviewLikelihoodPct || 0) - (a.interviewLikelihoodPct || 0) ||
        (b.personalMatchPct ?? b.matchPct ?? 0) - (a.personalMatchPct ?? a.matchPct ?? 0)
    );
}

module.exports = {
  computeInterviewLikelihood,
  enrichJobWithLikelihood,
  enrichJobsWithLikelihood,
  companySaturationPoints,
};
