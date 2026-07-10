const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { reassembleResume, parseResumeStructure } = require('../services/resumeStructureService');
const { sanitizeTailoredResume } = require('../services/resumeSectionSanitizeService');

const resume = `LEONIX ASONGWE
leonix23@gmail.com

PROFESSIONAL SUMMARY
Platform engineer with Azure experience.

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

describe('resume section integrity', () => {
  it('reassembleResume keeps original education and certifications when AI swaps in experience bullets', () => {
    const structure = parseResumeStructure(resume);
    const aiSections = [
      { heading: 'PROFESSIONAL SUMMARY', content: 'Partner manager summary for GitLab.' },
      { heading: 'TECHNICAL SKILLS', content: 'Truncated skills…' },
      {
        heading: 'EDUCATION',
        content: `- Architected Azure Databricks environments from scratch.
- Built scalable ETL pipelines using PySpark.`,
      },
      { heading: 'CERTIFICATIONS', content: 'Azure DevOps Engineer Expert | CKA' },
      {
        heading: 'PROFESSIONAL EXPERIENCE',
        content: 'Cloud Platform Engineer Feb 2022 Present Bon Secours Mercy Health\n- One bullet only.',
      },
    ];

    const text = reassembleResume(structure, aiSections);
    assert.ok(!text.includes('Architected Azure Databricks'), 'education must not contain experience bullets');
    assert.ok(text.includes('Western Governors University'));
    assert.ok(text.includes('University of Yaounde'));
    assert.ok(text.includes('Bon Secours Mercy Health'));
  });

  it('sanitizeTailoredResume relocates misplaced bullets and restores all jobs', () => {
    const broken = `LEONIX ASONGWE

PROFESSIONAL SUMMARY
Partner manager summary.

TECHNICAL SKILLS
Truncated skills…

EDUCATION
- Architected Azure Databricks environments from scratch.
- Built scalable ETL pipelines using PySpark.
Master of Science Information Technology | Western Governors University | Expected Dec 2026

CERTIFICATIONS
Azure DevOps Engineer Expert | CKA

PROFESSIONAL EXPERIENCE
Cloud Platform Engineer Feb 2022 Present Bon Secours Mercy Health
- Architected Azure Databricks environments from scratch.`;

    const fixed = sanitizeTailoredResume(resume, broken).tailoredResumeText;
    const eduIdx = fixed.indexOf('EDUCATION');
    const expIdx = fixed.indexOf('PROFESSIONAL EXPERIENCE');
    const eduBlock = fixed.slice(eduIdx, expIdx);
    assert.ok(!eduBlock.includes('Architected Azure Databricks'));
    assert.ok(fixed.includes('Wimora Technology'));
    assert.ok(fixed.includes('PRIMUS Global Services'));
    assert.ok(fixed.includes('Azure: AKS, Data Factory'));
    assert.ok(fixed.includes('Platform engineer with Azure experience'));
    assert.ok(!fixed.includes('Partner manager summary'));
  });
});
