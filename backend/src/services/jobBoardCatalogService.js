const jobSources = require('../config/jobSources');
const { getAllBoards } = require('../config/jobBoardCatalog');

function platformSelections() {
  const enabled = new Set(jobSources.enabledSources);
  const out = {};
  for (const board of getAllBoards()) {
    const key = board.fetcherKey;
    out[board.id] = Boolean(key && enabled.has(key));
  }
  out.linkedin = true;
  return out;
}

function getCatalog() {
  const { getCatalogPayload } = require('../config/jobBoardCatalog');
  return getCatalogPayload();
}

function mergeProfileSelections() {
  return platformSelections();
}

function jobMatchesEnabledSources(job) {
  const enabled = jobSources.enabledSources;
  const src = String(job?.source || '').toLowerCase();
  if (!src) return false;
  for (const name of enabled) {
    const compact = name.replace(/_/g, '');
    if (src.includes(name) || src.includes(compact)) return true;
  }
  if (src.includes('chrome-extension') || src.includes('linkedin')) return true;
  return false;
}

function filterJobsByBoardSelections(jobs) {
  if (!jobSources.enabledSources.length) return jobs;
  return jobs.filter(jobMatchesEnabledSources);
}

module.exports = {
  getCatalog,
  mergeProfileSelections,
  filterJobsByBoardSelections,
  jobMatchesEnabledSources,
  platformSelections,
};
