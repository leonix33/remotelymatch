const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildResumeBlueprint,
  assembleBlueprintResume,
} = require('../services/resumeBlueprintService');

const resume = `LEONIX ASONGWE
leonix23@gmail.com

PROFESSIONAL SUMMARY
Senior Platform Engineer with Azure and AWS experience.

TECHNICAL SKILLS
Azure: AKS, Data Factory
AWS: EC2, VPC

EDUCATION
Master of Science Information Technology | Western Governors University | Expected Dec 2026
Bachelor of Science Mathematics | University of Yaounde, Cameroon

CERTIFICATIONS
Azure DevOps Engineer Expert | CKA

PROFESSIONAL EXPERIENCE
Cloud Platform Engineer
Feb 2022 – Present
Bon Secours Mercy Health
- Architected Azure Databricks environments from scratch.
- Built scalable ETL pipelines using PySpark.
DevOps Engineer Aug 2020 Jan 2022 Wimora Technology
- Implemented DevSecOps pipelines with SAST and DAST scanning.
Cloud Engineer / DevOps Dec 2016 Jul 2020 PRIMUS Global Services
- Built multi-account AWS environments using EC2, VPC, IAM, S3, RDS, Lambda, and CloudFormation.`;

describe('resume blueprint pipeline', () => {
  it('buildResumeBlueprint captures all jobs from original', () => {
    const bp = buildResumeBlueprint(resume);
    assert.equal(bp.jobCount, 3);
    assert.equal(bp.experienceJobs.length, 3);
    assert.ok(bp.experienceJobs.every((j) => j.header && j.bulletCount >= 1));
  });

  it('assembleBlueprintResume restores summary, skills, education when AI corrupts them', () => {
    const broken = `LEONIX ASONGWE

PROFESSIONAL SUMMARY
Partner manager summary for unrelated role.

TECHNICAL SKILLS
Truncated skills…

EDUCATION
- Architected Azure Databricks environments from scratch.

CERTIFICATIONS
Azure DevOps Engineer Expert | CKA

PROFESSIONAL EXPERIENCE
Cloud Platform Engineer Feb 2022 Present Bon Secours Mercy Health
- Rewritten bullet for Azure Databricks and PySpark pipelines aligned to DevOps role.`;

    const fixed = assembleBlueprintResume(resume, broken).tailoredResumeText;
    assert.ok(fixed.includes('Senior Platform Engineer with Azure'));
    assert.ok(fixed.includes('Azure: AKS, Data Factory'));
    assert.ok(fixed.includes('Western Governors University'));
    assert.ok(!fixed.includes('Partner manager'));
    assert.ok(fixed.includes('Wimora Technology'));
    assert.ok(fixed.includes('PRIMUS Global Services'));
  });
});
