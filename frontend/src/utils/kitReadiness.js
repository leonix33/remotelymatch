export const READY_ATS_TARGET = 95;
export const READY_ATS_FALLBACK = 85;
export const READY_JD_MIN = 80;

export function isKitReadyToApply(kit) {
  if (!kit) return false;
  const hasKit = Boolean(kit.tailored || kit.hasKit);
  if (!hasKit) return false;
  if (kit.useForApply === false) return false;

  if (kit.recruiterReady) return true;

  const ats = Number(kit.atsScore);
  const jd = kit.jdMatchPct == null ? null : Number(kit.jdMatchPct);
  if (!Number.isFinite(ats)) return false;

  if (ats >= READY_ATS_TARGET) return true;
  if (ats >= READY_ATS_FALLBACK && (jd == null || jd >= READY_JD_MIN)) return true;
  return false;
}

export function readinessLabel(kit) {
  if (!kit?.hasKit) return 'No kit yet';
  if (kit.useForApply === false) return 'Base resume on apply';
  if (isKitReadyToApply(kit)) return 'Ready to apply';
  const ats = kit.atsScore ?? '—';
  return `Polish needed · ATS ${ats}%`;
}

export function readinessBadgeClass(kit) {
  if (!kit?.hasKit) return 'badge-slate';
  if (kit.useForApply === false) return 'badge-slate';
  if (isKitReadyToApply(kit)) return 'badge-teal';
  if ((kit.atsScore ?? 0) >= READY_ATS_FALLBACK) return 'badge-gold';
  return 'badge-slate';
}

export function summaryFromKitPayload(data) {
  if (!data?.tailored) {
    return {
      hasKit: false,
      readyToApply: false,
      atsScore: null,
      jdMatchPct: null,
      recruiterReady: false,
      atsReady: false,
    };
  }
  const summary = {
    hasKit: true,
    useForApply: data.useForApply !== false,
    pageCount: data.pageCount || data.supplementPages?.length || 0,
    supplementPagesTarget: data.supplementPagesTarget || data.pageCount || 3,
    tailorMode: data.tailorMode || 'high_match',
    estimatedMatchPct: data.estimatedMatchPct || null,
    generatedAt: data.generatedAt,
    atsScore: data.atsScore ?? null,
    jdMatchPct: data.jdMatchPct ?? null,
    atsReady: Boolean(data.atsReady),
    recruiterReady: Boolean(data.recruiterReady),
    polishTarget: data.highMatchTarget || READY_ATS_TARGET,
    perfectionPasses: data.perfectionPasses ?? 0,
    applied: false,
  };
  summary.readyToApply = isKitReadyToApply({ ...summary, tailored: true });
  return summary;
}
