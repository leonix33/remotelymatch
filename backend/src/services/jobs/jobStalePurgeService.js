const Job = require('../../models/Job');
const env = require('../../config/env');

const DAY_MS = 24 * 60 * 60 * 1000;

function resolveMaxAgeDays(explicit) {
  const n = explicit ?? env.jobMaxAgeDays ?? 30;
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/**
 * Remove jobs older than JOB_MAX_AGE_DAYS from Mongo.
 * Uses postedAt when present; otherwise firstSeen.
 */
async function purgeStaleJobs(maxAgeDays) {
  if (!env.mongoUri) return { deleted: 0, skipped: true };

  const days = resolveMaxAgeDays(maxAgeDays);
  const cutoff = new Date(Date.now() - days * DAY_MS);

  const result = await Job.deleteMany({
    $or: [
      { postedAt: { $lt: cutoff } },
      { postedAt: { $in: [null, undefined] }, firstSeen: { $lt: cutoff } },
      { postedAt: { $exists: false }, firstSeen: { $lt: cutoff } },
      { postedAt: { $in: [null, undefined] }, firstSeen: { $exists: false } },
      { postedAt: { $exists: false }, firstSeen: { $exists: false } },
    ],
  });

  return { deleted: result.deletedCount || 0, cutoff: cutoff.toISOString(), maxAgeDays: days };
}

function startStaleJobPurgeCron() {
  if (!env.mongoUri) return;

  const run = () => {
    purgeStaleJobs()
      .then(({ deleted, maxAgeDays }) => {
        if (deleted > 0) {
          console.log(`Purged ${deleted} stale job(s) older than ${maxAgeDays} days`);
        }
      })
      .catch((err) => console.warn('Stale job purge failed:', err.message));
  };

  run();
  setInterval(run, 24 * 60 * 60 * 1000);
}

module.exports = {
  purgeStaleJobs,
  startStaleJobPurgeCron,
  resolveMaxAgeDays,
};
