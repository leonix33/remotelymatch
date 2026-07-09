function normalizeKey(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text = '') {
  return new Set(normalizeKey(text).split(' ').filter((t) => t.length > 2));
}

function jaccardSimilarity(a, b) {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (!setA.size && !setB.size) return 1;
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union ? intersection / union : 0;
}

function dedupeKey(job) {
  const url = (job.applyUrl || job.url || '').split('?')[0].toLowerCase();
  if (url) return `url:${url}`;
  return `tc:${normalizeKey(job.title)}|${normalizeKey(job.company)}`;
}

function postedTime(job) {
  const raw = job?.postedAt || job?.firstSeen;
  const d = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(d) ? d : 0;
}

function applicantValue(job) {
  const n = job?.applicantCount;
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function pickBetterJob(a, b) {
  const ageA = postedTime(a);
  const ageB = postedTime(b);
  if (ageA !== ageB) return ageB > ageA ? b : a;

  const appA = applicantValue(a);
  const appB = applicantValue(b);
  if (appA !== appB) return appA < appB ? a : b;

  return (b.qualityScore || 0) >= (a.qualityScore || 0) ? b : a;
}

function sameUrl(a, b) {
  const urlA = (a.applyUrl || a.url || '').split('?')[0].toLowerCase();
  const urlB = (b.applyUrl || b.url || '').split('?')[0].toLowerCase();
  return Boolean(urlA && urlB && urlA === urlB);
}

function isFuzzyDuplicate(a, b, threshold = 0.82) {
  if (normalizeKey(a.company) !== normalizeKey(b.company)) return false;
  const titleSim = jaccardSimilarity(a.title, b.title);
  if (sameUrl(a, b)) return true;
  return titleSim >= threshold;
}

function isLikelyRepost(a, b, threshold = 0.82) {
  if (normalizeKey(a.company) !== normalizeKey(b.company)) return false;
  if (sameUrl(a, b)) return false;
  return jaccardSimilarity(a.title, b.title) >= threshold;
}

function markRepost(job, priorCount = 0) {
  return {
    ...job,
    isRepost: true,
    repostCount: priorCount + 1,
    saturationLabel: 'Reposted role',
  };
}

/**
 * Deduplicate jobs using applyUrl, title+company keys, fuzzy title similarity, and repost detection.
 * Keeps newest / lowest-applicant listing when duplicates are found.
 */
function deduplicateJobs(jobs, { fuzzyThreshold = 0.82 } = {}) {
  const byKey = new Map();
  const kept = [];

  for (const job of jobs) {
    const key = dedupeKey(job);
    if (byKey.has(key)) {
      const existing = byKey.get(key);
      const winner = pickBetterJob(job, existing);
      const loser = winner === job ? existing : job;
      if (isLikelyRepost(winner, loser, fuzzyThreshold) && !sameUrl(winner, loser)) {
        Object.assign(winner, markRepost(winner, loser.repostCount || 0));
      }
      const idx = kept.indexOf(existing);
      if (idx >= 0) kept[idx] = winner;
      byKey.set(key, winner);
      continue;
    }

    let duplicate = false;
    for (let i = 0; i < kept.length; i += 1) {
      const other = kept[i];
      if (!isFuzzyDuplicate(job, other, fuzzyThreshold)) continue;

      duplicate = true;
      const winner = pickBetterJob(job, other);
      const loser = winner === job ? other : job;
      if (isLikelyRepost(winner, loser, fuzzyThreshold) && !sameUrl(winner, loser)) {
        Object.assign(winner, markRepost(winner, loser.repostCount || 0));
      }
      kept[i] = winner;
      byKey.set(dedupeKey(winner), winner);
      break;
    }

    if (!duplicate) {
      kept.push(job);
      byKey.set(key, job);
    }
  }

  return kept;
}

module.exports = {
  deduplicateJobs,
  dedupeKey,
  isFuzzyDuplicate,
  isLikelyRepost,
  jaccardSimilarity,
  normalizeKey,
  pickBetterJob,
};
