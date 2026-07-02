const {
  getCatalogPayload,
  resolveSelections,
  jobMatchesSelections,
  defaultSelections,
} = require('../config/jobBoardCatalog');

function getCatalog() {
  return getCatalogPayload();
}

function mergeProfileSelections(profile) {
  const raw = profile?.jobBoardSelections;
  if (!raw || typeof raw !== 'object' || !Object.keys(raw).length) {
    return defaultSelections();
  }
  return resolveSelections(raw).merged;
}

function filterJobsByBoardSelections(jobs, profile) {
  const selections = mergeProfileSelections(profile);
  const anyOn = Object.values(selections).some(Boolean);
  if (!anyOn) return jobs;
  return jobs.filter((job) => jobMatchesSelections(job, selections));
}

module.exports = {
  getCatalog,
  mergeProfileSelections,
  filterJobsByBoardSelections,
  jobMatchesSelections,
};
