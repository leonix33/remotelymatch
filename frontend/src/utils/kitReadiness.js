export const READY_ATS_TARGET = 100;
export const READY_ATS_MIN = 100;
export const READY_JD_MIN = 100;

export function isKitReadyToApply(kit) {
  if (!kit) return false;
  const hasKit = Boolean(kit.tailored || kit.hasKit);
  if (!hasKit) return false;
  if (kit.useForApply === false) return false;

  const ats = Number(kit.atsScore);
  if (!Number.isFinite(ats)) return false;

  return ats >= READY_ATS_MIN;
}

export function readinessLabel(kit) {
  if (!kit?.hasKit) return 'No kit yet';
  if (kit.useForApply === false) return 'Base resume on apply';
  if (isKitReadyToApply(kit)) return 'Ready to apply';
  const ats = kit.atsScore ?? '—';
  return `Polish needed · ATS ${ats}% (min ${READY_ATS_MIN}%)`;
}

export function readinessBadgeClass(kit) {
  if (!kit?.hasKit) return 'badge-slate';
  if (kit.useForApply === false) return 'badge-slate';
  if (isKitReadyToApply(kit)) return 'badge-teal';
  if ((kit.atsScore ?? 0) >= READY_ATS_MIN) return 'badge-gold';
  return 'badge-slate';
}

export function buildTailorFocus(data, fallback = '') {
  const uncovered = Array.isArray(data?.uncoveredRequirements) ? data.uncoveredRequirements : [];
  const redTerms = (data?.atsBreakdown || [])
    .filter((b) => b?.status === 'red' && b?.term)
    .map((b) => b.term);
  const parts = [...uncovered, ...redTerms].filter(Boolean).slice(0, 12);
  return parts.join(', ') || fallback || '';
}

export function shouldStopPolish({ ats, jd, lastAts, lastJd, attempt, plateauCount }) {
  if (ats >= READY_ATS_TARGET) return true;
  if (ats >= READY_ATS_MIN && plateauCount >= 2) return true;
  if (attempt > 0 && ats <= lastAts && jd <= lastJd && ats < READY_ATS_MIN && plateauCount >= 2) return true;
  return false;
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
    supplementPagesTarget: data.supplementPagesTarget || data.pageCount || 4,
    tailorMode: data.tailorMode || 'high_match',
    estimatedMatchPct: data.estimatedMatchPct || null,
    generatedAt: data.generatedAt,
    atsScore: data.atsScore ?? null,
    jdMatchPct: data.jdMatchPct ?? null,
    atsReady: Boolean(data.atsReady),
    recruiterReady: Boolean(data.recruiterReady),
    polishTarget: data.highMatchTarget || READY_ATS_TARGET,
    perfectionPasses: data.perfectionPasses ?? 0,
    tailorFocus: data.tailorFocus || '',
    applied: false,
  };
  summary.readyToApply = isKitReadyToApply({ ...summary, tailored: true });
  return summary;
}
