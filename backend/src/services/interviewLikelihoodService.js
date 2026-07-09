const { freshnessScore } = require('./jobs/jobQualityService');
const { getConversionContext, companyJobCounts, DEFAULT_REPLY_RATE } = require('./conversionStatsService');

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

function companyVelocityPoints(company, companyCounts) {
  const key = normalize(company);
  const count = companyCounts[key] || 0;
  if (count >= 5) return { points: 10, label: 'High hiring velocity at company' };
  if (count >= 2) return { points: 6, label: 'Multiple open roles' };
  return { points: 2, label: 'Single listing' };
}

function sourceConversionPoints(job, context) {
  const key = normalize(job.source);
  const rate = context.sourceReplyRates[key] ?? context.userReplyRate ?? DEFAULT_REPLY_RATE;
  const points = Math.round(rate * 100);
  const pct = Math.round(rate * 100);
  const label =
    context.sampleSize >= 5
      ? `Your ${pct}% reply rate on ${job.source || 'this source'}`
      : `Typical ${Math.round(DEFAULT_REPLY_RATE * 100)}% baseline for this source`;
  return { points: Math.min(22, Math.max(4, points)), rate, label };
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

  const velocity = companyVelocityPoints(job.company, companyCounts);
  score += velocity.points;
  factors.push({ key: 'velocity', impact: velocity.points, label: velocity.label });

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

  return {
    interviewLikelihoodPct,
    likelihoodTier: likelihoodTier(interviewLikelihoodPct),
    likelihoodFactors: factors.slice(0, 8),
    recommendAction:
      interviewLikelihoodPct >= 35
        ? 'approve'
        : interviewLikelihoodPct >= 25
          ? 'review'
          : 'skip_unless_strategic',
  };
}

function enrichJobWithLikelihood(job, profile, context, companyCounts) {
  const likelihood = computeInterviewLikelihood(job, profile, context, companyCounts);
  return { ...job, ...likelihood };
}

function enrichJobsWithLikelihood(jobs, profile, userId) {
  const context = userId ? getConversionContext(userId) : { sourceReplyRates: {}, userReplyRate: DEFAULT_REPLY_RATE, sampleSize: 0 };
  const companyCounts = companyJobCounts(jobs);
  return jobs
    .map((j) => enrichJobWithLikelihood(j, profile, context, companyCounts))
    .sort(
      (a, b) =>
        (b.interviewLikelihoodPct || 0) - (a.interviewLikelihoodPct || 0) ||
        (b.personalMatchPct ?? b.matchPct ?? 0) - (a.personalMatchPct ?? a.matchPct ?? 0)
    );
}

module.exports = {
  computeInterviewLikelihood,
  enrichJobWithLikelihood,
  enrichJobsWithLikelihood,
};
