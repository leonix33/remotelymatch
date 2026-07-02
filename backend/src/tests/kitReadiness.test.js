const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isKitReadyToApply, buildKitSummary } = require('../services/kitReadinessService');

test('isKitReadyToApply accepts ATS 95+', () => {
  assert.equal(isKitReadyToApply({ tailored: true, atsScore: 95, jdMatchPct: 50 }), true);
  assert.equal(isKitReadyToApply({ tailored: true, atsScore: 100, jdMatchPct: 50 }), true);
});

test('isKitReadyToApply rejects recruiterReady below 95 ATS', () => {
  assert.equal(isKitReadyToApply({ tailored: true, atsScore: 86, recruiterReady: true }), false);
});

test('isKitReadyToApply rejects low ATS without kit', () => {
  assert.equal(isKitReadyToApply({ tailored: true, atsScore: 70, jdMatchPct: 90 }), false);
  assert.equal(isKitReadyToApply(null), false);
});

test('buildKitSummary includes scores and ready flag', () => {
  const summary = buildKitSummary(
    {
      tailored: true,
      atsScore: 96,
      jdMatchPct: 82,
      atsReady: true,
      recruiterReady: true,
      pageCount: 3,
      useForApply: true,
    },
    'approved'
  );
  assert.equal(summary.hasKit, true);
  assert.equal(summary.atsScore, 96);
  assert.equal(summary.readyToApply, true);
});
