const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyLocationRegion,
  isUsEligibleJob,
  isBlockedSource,
  filterUsRemoteJobs,
  inferSalaryCurrency,
} = require('../services/jobs/jobLocationFilter');

describe('jobLocationFilter', () => {
  it('classifies UK-only roles as international', () => {
    assert.equal(classifyLocationRegion('Remote', 'UK only — must be based in London'), 'international');
    assert.equal(classifyLocationRegion('London, UK', 'Remote software engineer £55,000'), 'international');
  });

  it('classifies US remote roles', () => {
    assert.equal(classifyLocationRegion('Remote, United States', ''), 'us');
    assert.equal(classifyLocationRegion('Remote', 'Work from anywhere worldwide'), 'worldwide');
  });

  it('blocks DevITJobs UK and Arbeitnow sources', () => {
    assert.equal(isBlockedSource('DevITJobs UK'), true);
    assert.equal(isBlockedSource('Arbeitnow'), true);
    assert.equal(isBlockedSource('RemoteOK'), false);
  });

  it('rejects UK jobs with £55k salary', () => {
    const ukJob = {
      title: 'DevOps Engineer',
      company: 'Acme',
      location: 'Remote',
      source: 'DevITJobs UK',
      description: 'Remote role based in United Kingdom. Salary £55,000 per year.',
      remoteType: 'remote',
    };
    assert.equal(isUsEligibleJob(ukJob), false);
  });

  it('accepts US remote jobs from trusted sources', () => {
    const usJob = {
      title: 'Platform Engineer',
      company: 'Datadog',
      location: 'Remote, United States',
      source: 'RemoteOK',
      description: 'Fully remote US role. $140k-$180k.',
      remoteType: 'remote',
    };
    assert.equal(isUsEligibleJob(usJob), true);
  });

  it('infers GBP currency from description', () => {
    assert.equal(inferSalaryCurrency({ description: 'Salary £55,000', source: 'DevITJobs' }), 'GBP');
    assert.equal(inferSalaryCurrency({ description: 'Salary $120,000', source: 'RemoteOK' }), 'USD');
  });

  it('filters a mixed job list', () => {
    const jobs = [
      { title: 'US Role', location: 'Remote, USA', source: 'RemoteOK', description: 'remote united states' },
      { title: 'UK Role', location: 'London', source: 'DevITJobs UK', description: 'uk only remote' },
    ];
    const filtered = filterUsRemoteJobs(jobs);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].title, 'US Role');
  });
});
