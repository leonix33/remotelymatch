const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  getCatalogPayload,
  getAllBoards,
  defaultSelections,
  jobMatchesSelections,
} = require('../config/jobBoardCatalog');

test('job board catalog includes taxonomy categories', () => {
  const payload = getCatalogPayload();
  assert.ok(payload.categories.length >= 40);
  assert.ok(payload.stats.total >= 200);
  assert.ok(payload.stats.live >= 20);
  assert.ok(payload.ingestGuidance.length >= 5);
});

test('default selections enable live boards', () => {
  const defaults = defaultSelections();
  const boards = getAllBoards();
  const liveIds = boards.filter((b) => b.status === 'live').map((b) => b.id);
  for (const id of liveIds) {
    assert.equal(defaults[id], true, `expected live board ${id} enabled by default`);
  }
});

test('jobMatchesSelections filters by source label', () => {
  const selections = { remote_ok: true, indeed: false };
  assert.equal(jobMatchesSelections({ source: 'RemoteOK' }, selections), true);
  assert.equal(jobMatchesSelections({ source: 'Indeed' }, selections), false);
});
