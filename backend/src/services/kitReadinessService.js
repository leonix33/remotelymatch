const READY_ATS_TARGET = 100;
const READY_ATS_MIN = 95;
const READY_JD_MIN = 80;

function isKitReadyToApply(kit) {
  if (!kit) return false;
  const hasKit = Boolean(kit.tailored || kit.hasKit);
  if (!hasKit) return false;
  if (kit.useForApply === false) return false;

  const ats = Number(kit.atsScore);
  if (!Number.isFinite(ats)) return false;

  return ats >= READY_ATS_MIN;
}

function buildKitSummary(kit, jobStatus) {
  if (!kit?.tailored) {
    return {
      hasKit: false,
      useForApply: null,
      pageCount: 0,
      applied: false,
      atsScore: null,
      jdMatchPct: null,
      atsReady: false,
      recruiterReady: false,
      readyToApply: false,
      polishTarget: READY_ATS_TARGET,
    };
  }

  const summary = {
    hasKit: true,
    useForApply: kit.useForApply !== false,
    pageCount: kit.pageCount || 0,
    supplementPagesTarget: kit.supplementPagesTarget || kit.pageCount,
    tailorMode: kit.tailorMode || 'high_match',
    estimatedMatchPct: kit.estimatedMatchPct || null,
    generatedAt: kit.generatedAt,
    applied: jobStatus === 'applied' || jobStatus === 'submitted',
    atsScore: kit.atsScore ?? null,
    jdMatchPct: kit.jdMatchPct ?? null,
    atsReady: Boolean(kit.atsReady),
    recruiterReady: Boolean(kit.recruiterReady),
    polishTarget: kit.highMatchTarget || READY_ATS_TARGET,
    perfectionPasses: kit.perfectionPasses ?? 0,
  };
  summary.readyToApply = isKitReadyToApply({ ...summary, tailored: true });
  return summary;
}

module.exports = {
  READY_ATS_TARGET,
  READY_ATS_MIN,
  READY_JD_MIN,
  isKitReadyToApply,
  buildKitSummary,
};
