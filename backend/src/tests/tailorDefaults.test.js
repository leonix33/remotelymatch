const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveTailorOptions, TAILOR_MODE, HIGH_MATCH_TARGET } = require('../config/tailorDefaults');

describe('tailorDefaults', () => {
  it('returns the same canonical settings for every call', () => {
    const a = resolveTailorOptions();
    const b = resolveTailorOptions({ tailorMode: 'balanced', highMatchTarget: 95, supplementPages: 1 });
    assert.deepEqual(a, b);
    assert.equal(a.tailorMode, TAILOR_MODE);
    assert.equal(a.highMatchTarget, HIGH_MATCH_TARGET);
    assert.equal(a.supplementPages, 4);
    assert.equal(a.atsTargetMin, 100);
    assert.ok(a.generateMaxPasses >= 0);
    assert.ok(a.polishMaxPasses >= 1);
  });
});
