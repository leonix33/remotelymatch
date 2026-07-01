const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeResumeText } = require('../services/resumeSanitizeService');

describe('resumeSanitizeService', () => {
  it('removes garbage dash-only lines in experience', () => {
    const input = `PROFESSIONAL EXPERIENCE
Senior Cloud Platform Engineer Feb 2022 Present Bon Secours Mercy Health
- -
-
Healthcare | Azure & Databricks Platform | On-Call Rotation
- Architected and deployed Azure Databricks environments from scratch.`;

    const out = sanitizeResumeText(input);
    assert.ok(!/^-\s*-$/m.test(out));
    assert.ok(out.includes('Healthcare | Azure & Databricks Platform'));
    assert.ok(out.includes('Architected and deployed Azure Databricks'));
  });

  it('splits merged tag line and first bullet', () => {
    const input = `PROFESSIONAL EXPERIENCE
Healthcare | Azure & Databricks Platform | SOC 2 Architected and deployed Azure Databricks environments from scratch.`;

    const out = sanitizeResumeText(input);
    assert.ok(out.includes('Healthcare | Azure & Databricks Platform | SOC 2'));
    assert.ok(/Architected and deployed Azure Databricks/.test(out));
    assert.ok(!/SOC 2 Architected/.test(out));
  });
});
