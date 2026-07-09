function repostPenaltyPoints(job = {}) {
  if (!job.isRepost) return { points: 0, label: null };
  const count = job.repostCount || 1;
  if (count >= 2) return { points: -10, label: 'Reposted multiple times — may be stale' };
  return { points: -5, label: 'Reposted role — prefer fresher listing' };
}

module.exports = {
  repostPenaltyPoints,
};
