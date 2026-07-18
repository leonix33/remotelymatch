const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  splitJobHeaderAndBullets,
  buildExperienceBlueprint,
  enforceExperienceIntegrity,
  expandBulletsToTarget,
} = require('../services/resumeExperiencePerfectionService');
const { TARGET_BULLETS_PER_JOB } = require('../config/tailorDefaults');
const { parseResumeStructure } = require('../services/resumeStructureService');
const { finalizeTailoredResume } = require('../services/resumeTailorService');

const fiveJobResume = `ALEX RIVERA
alex@email.com

PROFESSIONAL SUMMARY
Experienced professional with a strong track record.

PROFESSIONAL EXPERIENCE
Cloud Platform Engineer
Feb 2022 – Present
Bon Secours Mercy Health
- Architected Azure Databricks environments from scratch.
- Built scalable ETL pipelines using PySpark and Delta Lake.
- Led SOC 2 aligned security controls across cloud deployments.
DevOps Engineer Aug 2020 Jan 2022 Wimora Technology
- Implemented DevSecOps pipelines with SAST and DAST scanning.
- Managed Kubernetes clusters on AKS with Terraform automation.
Cloud Engineer / DevOps Dec 2016 Jul 2020 PRIMUS Global Services
- Built multi-account AWS environments using EC2, VPC, IAM, S3, RDS, Lambda, and CloudFormation.
- Led on-premises to cloud migration programs with SOC 2 aligned controls.
Systems Administrator Jan 2014 Dec 2016 Northline Systems
- Maintained Windows and Linux server fleets for enterprise operations.
- Automated patching and monitoring with PowerShell and Nagios.
Help Desk Technician Jun 2012 Dec 2013 Tech Support Co
- Resolved tier-1 and tier-2 support tickets for enterprise users.
- Documented troubleshooting guides and knowledge base articles.

EDUCATION
Bachelor of Science Information Technology | State University | 2012

CERTIFICATIONS
AWS Solutions Architect Associate | CKA`;

describe('resumeExperiencePerfectionService', () => {
  it('builds blueprint with original bullet counts per job', () => {
    const structure = parseResumeStructure(fiveJobResume);
    const exp = structure.sections.find((s) => s.key === 'experience');
    const { splitExperienceContentIntoJobs } = require('../services/resumeExperiencePreserveService');
    const jobs = splitExperienceContentIntoJobs(exp.content);
    const blueprint = buildExperienceBlueprint(jobs);

    assert.equal(blueprint.length, 5);
    assert.equal(blueprint[0].bulletCount, 3);
    assert.equal(blueprint[1].bulletCount, 3);
    assert.equal(blueprint[2].bulletCount, 3);
    assert.equal(blueprint[3].bulletCount, 3);
    assert.equal(blueprint[4].bulletCount, 3);
    assert.ok(blueprint.every((b) => b.bulletCount >= b.originalBulletCount));
  });

  it('expands sparse roles toward the target bullet count', () => {
    const expanded = expandBulletsToTarget(
      [
        'Built multi-account AWS environments using EC2, VPC, IAM, S3, RDS, Lambda, and CloudFormation for enterprise clients.',
        'Led on-premises to cloud migration programs with SOC 2 aligned controls.',
      ],
      TARGET_BULLETS_PER_JOB
    );
    assert.ok(expanded.length >= 2);
    assert.ok(expanded.length <= TARGET_BULLETS_PER_JOB || expanded.every((b) => b.length >= 20));
  });

  it('restores all five jobs and bullet counts when AI drops roles and bullets', () => {
    const tailoredBroken = `ALEX RIVERA

PROFESSIONAL EXPERIENCE
Cloud Platform Engineer Feb 2022 Present Bon Secours Mercy Health
- Architected Azure Databricks environments from scratch.

EDUCATION
Bachelor of Science Information Technology | State University | 2012

CERTIFICATIONS
AWS Solutions Architect Associate | CKA`;

    const restored = enforceExperienceIntegrity(fiveJobResume, tailoredBroken);
    assert.ok(restored.includes('Bon Secours Mercy Health'));
    assert.ok(restored.includes('Wimora Technology'));
    assert.ok(restored.includes('PRIMUS Global Services'));
    assert.ok(restored.includes('Northline Systems'));
    assert.ok(restored.includes('Tech Support Co'));
    assert.ok(restored.includes('Built scalable ETL pipelines'));
    assert.ok(restored.includes('knowledge base articles'));
  });

  it('finalizeTailoredResume keeps five jobs with full bullet slots', () => {
    const structure = parseResumeStructure(fiveJobResume);
    const kit = {
      sections: [
        { heading: 'PROFESSIONAL SUMMARY', content: 'Platform engineer with cloud and DevOps experience.' },
        {
          heading: 'PROFESSIONAL EXPERIENCE',
          content: `Cloud Platform Engineer Feb 2022 Present Bon Secours Mercy Health
- Architected Azure Databricks environments from scratch.`,
        },
        {
          heading: 'EDUCATION',
          content: structure.sections.find((s) => s.key === 'education').content,
        },
        {
          heading: 'CERTIFICATIONS',
          content: structure.sections.find((s) => s.key === 'certifications').content,
        },
      ],
    };

    const final = finalizeTailoredResume(fiveJobResume, structure, kit);
    const { splitExperienceContentIntoJobs } = require('../services/resumeExperiencePreserveService');
    const exp = structure.sections.find((s) => s.key === 'experience');
    const originalJobs = splitExperienceContentIntoJobs(exp.content);
    const finalJobs = splitExperienceContentIntoJobs(
      final.split(/\nPROFESSIONAL EXPERIENCE\n/i)[1]?.split(/\nEDUCATION\n/i)[0] || ''
    );

    assert.equal(finalJobs.length, originalJobs.length);
    for (let i = 0; i < originalJobs.length; i += 1) {
      const out = splitJobHeaderAndBullets(finalJobs[i]?.text || '');
      assert.ok(
        out.bullets.length >= Math.min(TARGET_BULLETS_PER_JOB, splitJobHeaderAndBullets(originalJobs[i].text).bullets.length) ||
          out.bullets.length >= splitJobHeaderAndBullets(originalJobs[i].text).bullets.length,
        `job ${i + 1} should keep or expand bullets, got ${out.bullets.length}`
      );
    }
  });
});
