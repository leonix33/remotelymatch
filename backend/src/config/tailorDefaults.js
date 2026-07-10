const env = require('./env');

const TAILOR_MODE = 'high_match';
const HIGH_MATCH_TARGET = 100;
const ATS_TARGET_MIN = Math.min(100, Math.max(85, Number(process.env.TAILOR_ATS_TARGET_MIN) || 90));
const KIT_PIPELINE_VERSION = '2026-07-10-v3';
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
    atsTargetMin: ATS_TARGET_MIN,
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
      'Every tailored resume preserves all employers, titles, dates, credentials, and bullet count per job — bullet wording is rewritten to match the posting (~4 pages, 90%+ ATS).',
  };
}

module.exports = {
  TAILOR_MODE,
  HIGH_MATCH_TARGET,
  ATS_TARGET_MIN,
  KIT_PIPELINE_VERSION,
  DEFAULT_SUPPLEMENT_PAGES,
  clampPageCount,
  resolveTailorOptions,
  describeTailorQuality,
};
