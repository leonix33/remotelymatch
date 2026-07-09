const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isStaffingCompany,
  isStaffingDomain,
  companyDomainMatches,
  isDirectEmployer,
  isVerifiedCompany,
  postedAgeLabel,
  employerTrustLabel,
  titleCaseSlug,
} = require('../services/jobs/companyTrustService');

describe('companyTrustService', () => {
  it('title-cases board slugs', () => {
    assert.equal(titleCaseSlug('grafanalabs'), 'Grafanalabs');
    assert.equal(titleCaseSlug('open-ai'), 'Open Ai');
  });

  it('detects staffing companies', () => {
    assert.equal(isStaffingCompany('Randstad Technologies'), true);
    assert.equal(isStaffingCompany('Kforce Inc'), true);
    assert.equal(isStaffingCompany('Datadog'), false);
  });

  it('detects staffing apply domains', () => {
    assert.equal(isStaffingDomain('www.roberthalf.com'), true);
    assert.equal(isStaffingDomain('boards.greenhouse.io'), false);
  });

  it('matches greenhouse company to board slug', () => {
    const job = {
      company: 'Datadog',
      applyUrl: 'https://boards.greenhouse.io/datadog/jobs/123',
      atsType: 'greenhouse',
      source: 'Greenhouse:datadog',
    };
    assert.equal(companyDomainMatches(job), true);
    assert.equal(isVerifiedCompany(job), true);
    assert.equal(isDirectEmployer(job), true);
    assert.equal(employerTrustLabel(job), 'Direct employer');
  });

  it('rejects greenhouse slug mismatch', () => {
    const job = {
      company: 'Totally Different Corp',
      applyUrl: 'https://boards.greenhouse.io/datadog/jobs/123',
      atsType: 'greenhouse',
      source: 'Greenhouse:datadog',
    };
    assert.equal(companyDomainMatches(job), false);
  });

  it('rejects staffing domain on apply URL', () => {
    const job = {
      company: 'Acme Corp',
      applyUrl: 'https://www.roberthalf.com/us/en/jobs/123',
      atsType: 'unknown',
      source: 'Manual',
    };
    assert.equal(companyDomainMatches(job), false);
    assert.equal(isVerifiedCompany(job), false);
  });

  it('formats posted age labels', () => {
    const recent = {
      postedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    };
    assert.equal(postedAgeLabel(recent), 'Posted 3d ago');
  });
});
