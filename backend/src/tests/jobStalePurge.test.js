const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveMaxAgeDays } = require('../services/jobs/jobStalePurgeService');

describe('jobStalePurgeService', () => {
  it('defaults max age to 30 days', () => {
    assert.equal(resolveMaxAgeDays(), 30);
    assert.equal(resolveMaxAgeDays(undefined), 30);
  });

  it('uses explicit max age when provided', () => {
    assert.equal(resolveMaxAgeDays(14), 14);
    assert.equal(resolveMaxAgeDays(45), 45);
  });

  it('falls back when max age is invalid', () => {
    assert.equal(resolveMaxAgeDays(0), 30);
    assert.equal(resolveMaxAgeDays(-5), 30);
  });
});
