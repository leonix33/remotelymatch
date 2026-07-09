/**
 * Per-user source performance weights from applications + outcomes.
 */

const { DEFAULT_REPLY_RATE } = require('../conversionStatsService');

function normalizeSource(source = '') {
  return String(source || 'unknown').trim().toLowerCase() || 'unknown';
}

function sourceWeightMultiplier(source = '', context = {}) {
  const key = normalizeSource(source);
  const stats = context.sourceStats?.[key];
  const rate = context.sourceReplyRates?.[key] ?? context.userReplyRate ?? DEFAULT_REPLY_RATE;

  if (!stats || stats.total < 5) return 1;

  if (rate >= 0.15) return 1.2;
  if (rate >= 0.1) return 1.1;
  if (rate >= 0.07) return 1.05;
  if (rate <= 0.02) return 0.7;
  if (rate <= 0.04) return 0.8;
  if (rate <= 0.06) return 0.9;
  return 1;
}

function isLowYieldSource(source = '', context = {}) {
  const key = normalizeSource(source);
  const stats = context.sourceStats?.[key];
  if (!stats || stats.total < 8) return false;
  const rate = context.sourceReplyRates?.[key] ?? DEFAULT_REPLY_RATE;
  return rate < 0.04;
}

function sourceLearningPoints(job = {}, context = {}) {
  const key = normalizeSource(job.source);
  const multiplier = sourceWeightMultiplier(job.source, context);
  const base = Math.round((context.sourceReplyRates?.[key] ?? context.userReplyRate ?? DEFAULT_REPLY_RATE) * 100);
  const points = Math.round(base * multiplier) - base;
  const lowYield = isLowYieldSource(job.source, context);

  let label;
  if (context.sampleSize >= 5 && context.sourceStats?.[key]?.total >= 5) {
    label = lowYield
      ? `Low reply history on ${job.source || 'this source'}`
      : `Strong reply history on ${job.source || 'this source'}`;
  } else {
    label = 'Building source performance data';
  }

  return {
    points: Math.min(12, Math.max(-10, points)),
    multiplier,
    lowYield,
    label,
  };
}

function applySourceLearningSort(jobs = [], context = {}) {
  return [...jobs].sort((a, b) => {
    const weightA = sourceWeightMultiplier(a.source, context);
    const weightB = sourceWeightMultiplier(b.source, context);
    if (weightB !== weightA) return weightB - weightA;
    return (b.interviewLikelihoodPct || 0) - (a.interviewLikelihoodPct || 0);
  });
}

module.exports = {
  normalizeSource,
  sourceWeightMultiplier,
  isLowYieldSource,
  sourceLearningPoints,
  applySourceLearningSort,
};
