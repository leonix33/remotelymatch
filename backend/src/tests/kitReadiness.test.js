const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isKitReadyToApply, isKitAtTarget, buildKitSummary } = require('../services/kitReadinessService');

test('isKitAtTarget requires 100 ATS, 100 JD fit, and zero red terms', () => {
  assert.equal(isKitAtTarget({ tailored: true, atsScore: 100, jdMatchPct: 100, atsRed: 0 }), true);
  assert.equal(isKitAtTarget({ tailored: true, atsScore: 100, jdMatchPct: 100, atsRed: 1 }), false);
  assert.equal(isKitAtTarget({ tailored: true, atsScore: 98, jdMatchPct: 100, atsRed: 0 }), false);
});

test('isKitReadyToApply uses the same 100% gate', () => {
  assert.equal(isKitReadyToApply({ tailored: true, atsScore: 100, jdMatchPct: 100, atsRed: 0 }), true);
  assert.equal(isKitReadyToApply({ tailored: true, atsScore: 95, jdMatchPct: 100, atsRed: 0 }), false);
  assert.equal(isKitReadyToApply({ tailored: true, atsScore: 70, jdMatchPct: 90, atsRed: 0 }), false);
  assert.equal(isKitReadyToApply(null), false);
});

test('buildKitSummary includes scores and ready flag', () => {
  const summary = buildKitSummary(
    {
      tailored: true,
      atsScore: 100,
      jdMatchPct: 100,
      atsRed: 0,
      atsReady: true,
      recruiterReady: true,
      pageCount: 3,
      useForApply: true,
    },
    'approved'
  );
  assert.equal(summary.hasKit, true);
  assert.equal(summary.atsScore, 100);
  assert.equal(summary.readyToApply, true);
});
