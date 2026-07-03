const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

describe('password reset code validation', () => {
  it('accepts a 6-digit numeric code hash match', async () => {
    const code = '482910';
    const codeHash = await bcrypt.hash(code, 10);
    assert.equal(await bcrypt.compare(code, codeHash), true);
    assert.equal(await bcrypt.compare('482911', codeHash), false);
  });

  it('rejects malformed codes before database lookup', () => {
    const badCodes = ['', '12345', '1234567', '12ab56'];
    for (const code of badCodes) {
      const clean = String(code || '').trim();
      assert.equal(/^\d{6}$/.test(clean), false, `expected invalid: ${JSON.stringify(code)}`);
    }
  });
});

describe('password reset auth exports', () => {
  it('exports code-based reset helpers', () => {
    const auth = require('../services/authService');
    assert.equal(typeof auth.requestPasswordReset, 'function');
    assert.equal(typeof auth.completePasswordResetWithCode, 'function');
    assert.equal(typeof auth.completePasswordReset, 'function');
  });
});
