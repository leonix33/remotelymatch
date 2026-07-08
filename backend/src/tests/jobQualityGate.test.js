const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { enrichJobScores } = require('../services/jobs/jobQualityService');
const {
  isTrustedSource,
  isActionableJob,
  meetsSalaryFloor,
  filterQualityJobs,
  effectiveSalaryUsd,
} = require('../services/jobs/jobQualityGate');

const baseJob = {
  title: 'Senior Platform Engineer',
  company: 'Datadog',
  location: 'Remote, United States',
  applyUrl: 'https://boards.greenhouse.io/datadog/jobs/123',
  source: 'Greenhouse',
  description: 'Remote US role. '.repeat(40),
  remoteType: 'remote',
};

describe('jobQualityGate', () => {
  it('trusts only actionable sources', () => {
    assert.equal(isTrustedSource('Greenhouse'), true);
    assert.equal(isTrustedSource('RemoteOK'), true);
    assert.equal(isTrustedSource('DevITJobs UK'), false);
    assert.equal(isTrustedSource('Working Nomads'), false);
    assert.equal(isTrustedSource('Dice'), false);
  });

  it('rejects low USD salary listings', () => {
    const lowPay = {
      ...baseJob,
      description: `${baseJob.description} Salary: $55,000 - $65,000 per year.`,
      salaryMin: 55000,
      salaryMax: 65000,
    };
    assert.equal(meetsSalaryFloor(lowPay, 100000), false);
    assert.equal(isActionableJob(enrichJobScores(lowPay), { minSalaryUsd: 100000 }), false);
  });

  it('rejects GBP salary below USD floor', () => {
    const gbpJob = enrichJobScores({
      ...baseJob,
      source: 'RemoteOK',
      description: `${baseJob.description} Compensation £55,000 annually.`,
    });
    assert.equal(meetsSalaryFloor(gbpJob, 100000), false);
    assert.equal(isActionableJob(gbpJob, { minSalaryUsd: 100000 }), false);
  });

  it('allows ATS jobs without listed salary', () => {
    const ats = enrichJobScores({ ...baseJob, salaryMin: null, salaryMax: null });
    assert.equal(isActionableJob(ats, { minSalaryUsd: 100000 }), true);
  });

  it('allows high-salary remote board jobs', () => {
    const highPay = enrichJobScores({
      ...baseJob,
      source: 'RemoteOK',
      applyUrl: 'https://remoteok.com/remote-jobs/123',
      description: `${baseJob.description} Salary $140,000 - $180,000.`,
      salaryMin: 140000,
      salaryMax: 180000,
    });
    assert.equal(isActionableJob(highPay, { minSalaryUsd: 100000 }), true);
  });

  it('rejects jobs with search-page URLs', () => {
    const searchPage = enrichJobScores({
      ...baseJob,
      applyUrl: 'https://example.com/jobs/search?q=engineer',
    });
    assert.equal(isActionableJob(searchPage, { minSalaryUsd: 100000 }), false);
  });

  it('filters mixed quality list', () => {
    const jobs = [
      enrichJobScores(baseJob),
      enrichJobScores({
        title: 'Cheap Role',
        company: 'UK Co',
        location: 'London, UK',
        applyUrl: 'https://devitjobs.uk/job/1',
        source: 'DevITJobs UK',
        description: 'UK only remote £55,000',
      }),
    ];
    const out = filterQualityJobs(jobs, { minSalaryUsd: 100000 });
    assert.equal(out.length, 1);
    assert.equal(out[0].company, 'Datadog');
  });

  it('parses effective salary from description', () => {
    const salary = effectiveSalaryUsd({
      description: 'Total compensation $130,000 - $160,000 per year',
    });
    assert.equal(salary.known, true);
    assert.equal(salary.maxUsd, 160000);
  });
});
