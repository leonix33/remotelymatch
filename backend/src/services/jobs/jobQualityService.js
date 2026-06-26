function freshnessScore(postedAt) {
  if (!postedAt) return 40;
  const posted = new Date(postedAt);
  if (Number.isNaN(posted.getTime())) return 40;

  const ageMs = Date.now() - posted.getTime();
  const hours = ageMs / (1000 * 60 * 60);

  if (hours <= 24) return 100;
  if (hours <= 24 * 7) return 75;
  if (hours <= 24 * 30) return 50;
  return 25;
}

function freshnessLabel(postedAt) {
  const score = freshnessScore(postedAt);
  if (score >= 100) return 'posted_24h';
  if (score >= 75) return 'posted_7d';
  if (score >= 50) return 'posted_30d';
  return 'older';
}

function qualityScore(job) {
  let score = 0;

  const descLen = (job.description || '').length;
  if (descLen > 100) score += 15;
  if (descLen > 400) score += 15;
  if (descLen > 1000) score += 10;

  if (job.salaryMin || job.salaryMax) score += 20;
  if ((job.skills || []).length >= 3) score += 15;
  if ((job.skills || []).length >= 6) score += 5;

  if (job.remoteType === 'remote' || job.remoteType === 'worldwide') score += 10;
  if (job.applyUrl && /^https?:\/\//i.test(job.applyUrl)) score += 10;

  const ats = job.atsType || '';
  if (['greenhouse', 'lever', 'ashby'].includes(ats)) score += 10;

  score += Math.round(freshnessScore(job.postedAt) * 0.15);

  return Math.min(100, score);
}

function enrichJobScores(job) {
  const freshness = freshnessScore(job.postedAt);
  const quality = qualityScore(job);
  const baselineMatch = job.matchPct || Math.max(45, Math.min(80, quality + 12));
  return {
    ...job,
    freshnessScore: freshness,
    freshnessLabel: freshnessLabel(job.postedAt),
    qualityScore: quality,
    matchPct: baselineMatch,
    emailSection:
      job.emailSection ||
      (quality >= 70 && freshness >= 75
        ? 'apply_today'
        : quality >= 50
          ? 'strong_review'
          : 'manual_browse'),
  };
}

function enrichJobs(jobs) {
  return jobs.map(enrichJobScores);
}

module.exports = {
  freshnessScore,
  freshnessLabel,
  qualityScore,
  enrichJobScores,
  enrichJobs,
};
