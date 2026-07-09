const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseApplicantCount,
  isOversaturated,
  applicantCountPoints,
} = require('../services/jobs/jobApplicantService');
const { deduplicateJobs } = require('../services/jobs/jobDedupService');
const { sourceWeightMultiplier, isLowYieldSource } = require('../services/jobs/sourceLearningService');
const { enrichJobScores } = require('../services/jobs/jobQualityService');
const { isActionableJob } = require('../services/jobs/jobQualityGate');

describe('jobApplicantService', () => {
  it('parses plain and over applicant counts', () => {
    assert.equal(parseApplicantCount('42 applicants')?.applicantCount, 42);
    assert.equal(parseApplicantCount('Over 100 applicants')?.applicantCountCapped, true);
  });

  it('flags oversaturated listings', () => {
    assert.equal(isOversaturated({ applicantCount: 120 }, 75), true);
    assert.equal(isOversaturated({ applicantCount: 30 }, 75), false);
  });

  it('rewards low applicant counts in scoring', () => {
    const points = applicantCountPoints({ applicantCount: 12, applicantCountLabel: '12 applicants' }, 75);
    assert.ok(points.points > 0);
  });
});

describe('jobDedupService repost detection', () => {
  it('keeps newest listing and marks repost', () => {
    const jobs = deduplicateJobs([
      {
        title: 'Senior Project Manager',
        company: 'Acme',
        applyUrl: 'https://boards.greenhouse.io/acme/jobs/1',
        postedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        qualityScore: 60,
      },
      {
        title: 'Senior Project Manager',
        company: 'Acme',
        applyUrl: 'https://boards.greenhouse.io/acme/jobs/2',
        postedAt: new Date().toISOString(),
        qualityScore: 55,
      },
    ]);

    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].isRepost, true);
    assert.equal(jobs[0].applyUrl.includes('/jobs/2'), true);
  });
});

describe('sourceLearningService', () => {
  it('down-weights low-yield sources with enough samples', () => {
    const context = {
      sourceReplyRates: { linkedin: 0.02 },
      sourceStats: { linkedin: { total: 10, replies: 0 } },
      sampleSize: 10,
    };
    assert.ok(sourceWeightMultiplier('linkedin', context) < 1);
    assert.equal(isLowYieldSource('linkedin', context), true);
  });
});

describe('jobQualityGate applicant filter', () => {
  it('rejects oversaturated jobs when applicant count is known', () => {
    const job = enrichJobScores({
      title: 'Senior Project Manager',
      company: 'Acme',
      location: 'Remote, United States',
      applyUrl: 'https://boards.greenhouse.io/acme/jobs/1',
      source: 'Greenhouse:acme',
      description: 'Remote US role. '.repeat(40),
      remoteType: 'remote',
      postedAt: new Date().toISOString(),
      applicantCount: 120,
      applicantCountLabel: 'Over 100 applicants',
      applicantCountCapped: true,
    });
    assert.equal(isActionableJob(job, { minSalaryUsd: 100000, maxAgeDays: 30, maxApplicants: 75 }), false);
  });
});
