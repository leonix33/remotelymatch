const Job = require('../../models/Job');
const env = require('../../config/env');
const jobSourcesConfig = require('../../config/jobSources');
const { normalizeJob } = require('./jobNormalizer');
const { deduplicateJobs } = require('./jobDedupService');
const { enrichJobs } = require('./jobQualityService');
const { SOURCE_FETCHERS } = require('./jobSourceFetchers');

let lastIngest = {
  startedAt: null,
  finishedAt: null,
  sources: {},
  totals: { fetched: 0, deduped: 0, saved: 0 },
  errors: [],
};

function getIngestStatus() {
  return lastIngest;
}

function allFetcherSources() {
  return Object.keys(SOURCE_FETCHERS);
}

function resolveSourceNames(explicit) {
  if (explicit?.length) return explicit;
  const configured = jobSourcesConfig.enabledSources || [];
  return configured.length ? configured : allFetcherSources();
}

async function fetchFromSources(sourceNames) {
  const names = resolveSourceNames(sourceNames);
  const results = {};
  const errors = [];

  for (const name of names) {
    const fetcher = SOURCE_FETCHERS[name];
    if (!fetcher) {
      errors.push({ source: name, message: 'Unknown source' });
      continue;
    }
    try {
      const raw = await fetcher();
      results[name] = raw;
    } catch (err) {
      errors.push({ source: name, message: err.message });
      results[name] = [];
    }
  }

  return { results, errors };
}

async function ingestJobs({ sources, persist = true, dryRun = false } = {}) {
  const sourceNames = resolveSourceNames(sources);
  lastIngest = {
    startedAt: new Date().toISOString(),
    finishedAt: null,
    sources: {},
    totals: { fetched: 0, deduped: 0, saved: 0 },
    errors: [],
  };

  const { results, errors } = await fetchFromSources(sourceNames);
  lastIngest.errors = errors;

  const normalized = [];
  for (const [source, rows] of Object.entries(results)) {
    lastIngest.sources[source] = { fetched: rows.length };
    lastIngest.totals.fetched += rows.length;
    for (const row of rows) {
      if (!row?.title) continue;
      normalized.push(normalizeJob(row));
    }
  }

  const scored = enrichJobs(normalized);
  const deduped = deduplicateJobs(scored);
  lastIngest.totals.deduped = deduped.length;

  if (dryRun || !persist) {
    lastIngest.finishedAt = new Date().toISOString();
    return { jobs: deduped, ...lastIngest };
  }

  if (!env.mongoUri) {
    lastIngest.finishedAt = new Date().toISOString();
    return {
      jobs: deduped,
      saved: 0,
      message: 'MongoDB not configured — returned jobs without persisting',
      ...lastIngest,
    };
  }

  let saved = 0;
  for (const job of deduped) {
    await Job.findOneAndUpdate({ jobId: job.jobId }, job, { upsert: true, new: true });
    saved += 1;
  }
  lastIngest.totals.saved = saved;
  lastIngest.finishedAt = new Date().toISOString();

  return { jobs: deduped, saved, ...lastIngest };
}

function listConfiguredSources() {
  const active = new Set(resolveSourceNames());
  return allFetcherSources().map((name) => ({
    name,
    enabled: active.has(name),
    configured: Boolean(SOURCE_FETCHERS[name]),
    requiresApiKey: name === 'usajobs' || name === 'adzuna',
    apiKeyPresent:
      name === 'usajobs'
        ? Boolean(jobSourcesConfig.usajobsApiKey)
        : name === 'adzuna'
          ? Boolean(jobSourcesConfig.adzunaAppId && jobSourcesConfig.adzunaAppKey)
          : true,
    lastFetched: lastIngest.sources[name]?.fetched ?? null,
  }));
}

module.exports = {
  ingestJobs,
  fetchFromSources,
  getIngestStatus,
  listConfiguredSources,
};
