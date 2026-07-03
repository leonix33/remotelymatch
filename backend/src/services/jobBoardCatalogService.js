const { getCatalogPayload } = require('../config/jobBoardCatalog');

function getCatalog() {
  return getCatalogPayload();
}

/** All ingested jobs are shown — sources are controlled at ingest time via jobSources.js */
function filterJobsByBoardSelections(jobs) {
  return jobs;
}

module.exports = {
  getCatalog,
  filterJobsByBoardSelections,
};
