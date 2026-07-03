const Job = require('../models/Job');
const jobService = require('../services/jobService');
const jobIngestService = require('../services/jobs/jobIngestService');
const jobListCache = require('../services/jobListCache');
const jobBoardCatalogService = require('../services/jobBoardCatalogService');
const jobInterviewInsightService = require('../services/jobInterviewInsightService');
const env = require('../config/env');

function applyJobFilters(jobs, { section, minMatch, minQuality, source, freshness, search }) {
  let list = jobs;
  if (section && section !== 'all') {
    list = list.filter((j) => j.emailSection === section);
  }
  if (Number(minMatch) > 0) {
    list = list.filter((j) => (j.personalMatchPct ?? j.matchPct ?? 0) >= Number(minMatch));
  }
  if (Number(minQuality) > 0) {
    list = list.filter((j) => (j.qualityScore || 0) >= Number(minQuality));
  }
  if (source && source !== 'all') {
    const needle = source.toLowerCase();
    list = list.filter((j) => (j.source || '').toLowerCase().includes(needle));
  }
  if (freshness) {
    list = list.filter((j) => j.freshnessLabel === freshness);
  }
  if (search) {
    const needle = search.toLowerCase();
    list = list.filter((j) =>
      [j.title, j.company, j.location, j.source, (j.skills || []).join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }
  return list;
}

async function listJobs(req, res, next) {
  try {
    const {
      section = 'all',
      minMatch = '0',
      minQuality = '0',
      source = 'all',
      freshness = '',
      search = '',
      limit: limitParam = '100',
      offset: offsetParam = '0',
    } = req.query;

    let jobs;
    if (req.user?.sub) {
      const scored = await jobListCache.listScoredForUser(req.user.sub);
      jobs = applyJobFilters(scored.jobs, { section, minMatch, minQuality, source, freshness, search });
    } else if (env.mongoUri) {
      const query = {};
      if (section !== 'all') query.emailSection = section;
      if (Number(minMatch) > 0) query.matchPct = { $gte: Number(minMatch) };
      if (Number(minQuality) > 0) query.qualityScore = { $gte: Number(minQuality) };
      if (source !== 'all') query.source = new RegExp(source, 'i');
      if (freshness) query.freshnessLabel = freshness;
      jobs = await Job.find(query)
        .sort({ qualityScore: -1, freshnessScore: -1, matchPct: -1 })
        .limit(2000)
        .lean();
      jobs = applyJobFilters(jobs, { section, minMatch, minQuality, source, freshness, search });
    } else {
      jobs = jobService.listJobsFromSqlite({ section, minMatch: 0, search });
      jobs = applyJobFilters(jobs, { section, minMatch, minQuality, source, freshness, search });
    }

    const total = jobs.length;
    const limit = Math.min(200, Math.max(1, Number(limitParam) || 100));
    const offset = Math.max(0, Number(offsetParam) || 0);
    const page = jobs.slice(offset, offset + limit);

    res.json({ jobs: page, total, limit, offset });
  } catch (err) {
    next(err);
  }
}

async function syncJobs(req, res, next) {
  try {
    const count = await jobService.syncJobsToMongo();
    res.json({ synced: count });
  } catch (err) {
    next(err);
  }
}

async function importJobs(req, res, next) {
  try {
    if (!env.mongoUri) {
      return res.status(400).json({ message: 'MongoDB is required for import' });
    }
    const jobs = req.body.jobs;
    if (!Array.isArray(jobs) || !jobs.length) {
      return res.status(400).json({ message: 'jobs array is required' });
    }
    let imported = 0;
    for (const job of jobs) {
      if (!job.jobId) continue;
      await Job.findOneAndUpdate({ jobId: job.jobId }, job, { upsert: true, new: true });
      imported += 1;
    }
    res.json({ imported });
  } catch (err) {
    next(err);
  }
}

async function ingestJobs(req, res, next) {
  try {
    const sources = req.body?.sources;
    const dryRun = req.query.dryRun === 'true' || req.body?.dryRun === true;
    const result = await jobIngestService.ingestJobs({ sources, persist: !dryRun, dryRun });
    res.json({
      saved: result.saved || 0,
      fetched: result.totals?.fetched || 0,
      deduped: result.totals?.deduped || 0,
      errors: result.errors || [],
      sources: result.sources || {},
      dryRun,
      sample: (result.jobs || []).slice(0, 5),
    });
  } catch (err) {
    next(err);
  }
}

async function ingestStatus(req, res, next) {
  try {
    res.json({
      lastIngest: jobIngestService.getIngestStatus(),
      sources: jobIngestService.listConfiguredSources(),
    });
  } catch (err) {
    next(err);
  }
}

async function boardCatalog(req, res, next) {
  try {
    res.json(jobBoardCatalogService.getCatalog());
  } catch (err) {
    next(err);
  }
}

async function getInterviewInsight(req, res, next) {
  try {
    const insight = await jobInterviewInsightService.getInterviewInsight(req.user.sub, req.params.jobId);
    res.json(insight);
  } catch (err) {
    next(err);
  }
}

module.exports = { listJobs, syncJobs, importJobs, ingestJobs, ingestStatus, boardCatalog, getInterviewInsight };
