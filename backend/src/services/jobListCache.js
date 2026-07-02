const { scoreJobsForProfile } = require('./jobScoringService');
const profileService = require('./profileService');
const jobService = require('./jobService');
const { filterJobsByBoardSelections } = require('./jobBoardCatalogService');
const env = require('../config/env');
const Job = require('../models/Job');

const CACHE_MS = 90_000;
const cache = new Map();

function cacheKey(userId, profile) {
  const resumeLen = (profile?.resumeText || '').length;
  const titles = (profile?.targetTitles || []).length;
  const skills = (profile?.mustHaveSkills || []).length;
  const boards = JSON.stringify(profile?.jobBoardSelections || {});
  return `${userId}:${profile?.minMatchScore || 0}:${resumeLen}:${titles}:${skills}:${boards}`;
}

async function loadRawJobs() {
  const limit = env.openJobMarket !== false ? 2000 : 500;
  if (env.mongoUri) {
    return Job.find({})
      .sort({ qualityScore: -1, freshnessScore: -1, matchPct: -1 })
      .limit(limit)
      .lean();
  }
  return jobService.readJobsFromSqlite(limit);
}

async function listScoredForUser(userId) {
  const profile = await profileService.getOrCreate(userId);
  const key = cacheKey(userId, profile);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return { jobs: hit.jobs, profile };
  }

  let jobs = await loadRawJobs();
  jobs = filterJobsByBoardSelections(jobs, profile);
  jobs = scoreJobsForProfile(jobs, profile, userId);
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
