const env = require('./env');

const TAILOR_MODE = 'high_match';
const HIGH_MATCH_TARGET = 100;
const ATS_TARGET_MIN = Math.min(100, Math.max(85, Number(process.env.TAILOR_ATS_TARGET_MIN) || 90));
const KIT_PIPELINE_VERSION = '2026-07-18-v20-tagline-polish';
const TARGET_BULLETS_PER_JOB = Math.min(
  12,
  Math.max(8, Number(process.env.TAILOR_BULLETS_PER_JOB) || 10)
);

const RESUME_INTEGRITY_CONTRACT = `RESUME INTEGRITY (every user, every job — non-negotiable):
- Keep EVERY employer from the candidate's profile resume, in original order.
- Keep EXACT job titles, companies, date ranges, education, certifications, credentials, and contact block unchanged.
- Keep the SAME accomplishment bullet count per role as the original resume — rewrite bullet wording only for JD alignment.
- Keep the professional summary unchanged; only experience bullets are tailored.
- Job headers must NOT use bullet prefixes (-, •, *); bullets are accomplishments only.
- Never invent employers, dates, certs, or metrics.`;
const POLISH_INTERACTIVE_MAX_ROUNDS = 1;
const POLISH_INTERACTIVE_MAX_PASSES = 1;
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
      `Every user gets the same tailoring contract: all employers preserved, ~${TARGET_BULLETS_PER_JOB} bullets per role, credentials intact — bullet wording tailored to each posting (~4 pages, 90%+ ATS).`,
  };
}

module.exports = {
  TAILOR_MODE,
  HIGH_MATCH_TARGET,
  ATS_TARGET_MIN,
  TARGET_BULLETS_PER_JOB,
  KIT_PIPELINE_VERSION,
  RESUME_INTEGRITY_CONTRACT,
  POLISH_INTERACTIVE_MAX_ROUNDS,
  POLISH_INTERACTIVE_MAX_PASSES,
  DEFAULT_SUPPLEMENT_PAGES,
  clampPageCount,
  resolveTailorOptions,
  describeTailorQuality,
};
