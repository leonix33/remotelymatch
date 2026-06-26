const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

describe('login password normalization', () => {
  it('trimmed password matches hash of trimmed input', async () => {
    const rawWithSpace = 'SecretPass1 ';
    const trimmed = rawWithSpace.trim();
    const hashFromUntrimmed = await bcrypt.hash(rawWithSpace, 10);
    const hashFromTrimmed = await bcrypt.hash(trimmed, 10);

    assert.equal(await bcrypt.compare(trimmed, hashFromTrimmed), true);
    assert.equal(await bcrypt.compare(trimmed, hashFromUntrimmed), false);
  });
});
