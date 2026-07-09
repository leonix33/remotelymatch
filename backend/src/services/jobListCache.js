const { scoreJobsForProfile } = require('./jobScoringService');
const profileService = require('./profileService');
const jobService = require('./jobService');
const env = require('../config/env');
const Job = require('../models/Job');
const { applyJobPoolFilters, filterByCallbackScore, poolOptionsForProfile } = require('./jobPoolFilter');
const { warmConversionContext } = require('./conversionStatsService');

const CACHE_MS = 90_000;
const cache = new Map();

function cacheKey(userId, profile) {
  const resumeLen = (profile?.resumeText || '').length;
  const titles = (profile?.targetTitles || []).length;
  const skills = (profile?.mustHaveSkills || []).length;
  return `${userId}:${profile?.minMatchScore || 0}:${resumeLen}:${titles}:${skills}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function recentJobCutoff(days = 60) {
  const d = Number(days) || 60;
  return new Date(Date.now() - d * DAY_MS);
}

async function loadRawJobs() {
  const limit = env.openJobMarket !== false ? 2000 : 500;
  const cutoff = recentJobCutoff(Math.max(env.jobMaxAgeDays || 30, 60));
  if (env.mongoUri) {
    return Job.find({
      $or: [
        { postedAt: { $gte: cutoff } },
        { postedAt: { $in: [null, undefined] }, updatedAt: { $gte: cutoff } },
        { postedAt: { $exists: false }, updatedAt: { $gte: cutoff } },
      ],
    })
      .sort({ postedAt: -1, updatedAt: -1, qualityScore: -1, freshnessScore: -1 })
      .limit(limit)
      .lean();
  }
  return jobService.readJobsFromSqlite(limit);
}

async function listScoredForUser(userId, { skipCallbackFilter = false } = {}) {
  const profile = await profileService.getOrCreate(userId);
  const poolOpts = poolOptionsForProfile(profile);
  const key = `${cacheKey(userId, profile)}:${skipCallbackFilter ? 'all' : 'cb'}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return { jobs: hit.jobs, profile };
  }

  let jobs = await loadRawJobs();
  jobs = applyJobPoolFilters(jobs, poolOpts);
  const conversionContext = await warmConversionContext(userId);
  jobs = scoreJobsForProfile(jobs, profile, userId, conversionContext);
  if (!skipCallbackFilter) {
    jobs = filterByCallbackScore(jobs, { ...poolOpts, conversionContext });
  }
  cache.set(key, { at: Date.now(), jobs });
  return { jobs, profile };
}

function invalidate(userId) {
  const prefix = `${userId}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

module.exports = { listScoredForUser, invalidate, CACHE_MS };
