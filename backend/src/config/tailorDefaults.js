const env = require('./env');

const TAILOR_MODE = 'high_match';
const HIGH_MATCH_TARGET = 100;
const DEFAULT_SUPPLEMENT_PAGES = Math.min(6, Math.max(1, Number(process.env.TAILOR_DEFAULT_PAGES) || 4));

function clampPageCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_SUPPLEMENT_PAGES;
  return Math.min(6, Math.max(1, Math.round(v)));
}

/**
 * Canonical tailoring settings for every user and every job.
 * Per-profile or per-request overrides are ignored so output quality stays consistent.
 */
function resolveTailorOptions() {
  return {
    tailorMode: TAILOR_MODE,
    highMatchTarget: HIGH_MATCH_TARGET,
    supplementPages: clampPageCount(DEFAULT_SUPPLEMENT_PAGES),
    generateMaxPasses: env.tailorGenerateMaxPasses,
    polishMaxPasses: env.tailorPolishMaxPasses,
  };
}

function describeTailorQuality() {
  return {
    tailorMode: TAILOR_MODE,
    highMatchTarget: HIGH_MATCH_TARGET,
    supplementPages: DEFAULT_SUPPLEMENT_PAGES,
    label: 'Standard high-match tailoring',
    description:
      'Every tailored resume uses the same ATS-optimized pipeline: all employers preserved, credentials intact, job-aligned bullets (~4 pages).',
  };
}

module.exports = {
  TAILOR_MODE,
  HIGH_MATCH_TARGET,
  DEFAULT_SUPPLEMENT_PAGES,
  clampPageCount,
  resolveTailorOptions,
  describeTailorQuality,
};
