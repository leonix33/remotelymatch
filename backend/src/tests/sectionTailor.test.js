const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { analyzeJobPosting, inferSeniority, extractYearsExperience } = require('../services/jobAnalysisService');
const {
  validateTailorResponse,
  formatValidationErrors,
} = require('../services/tailorResponseValidator');
const { buildEditablePayload } = require('../services/sectionTailorService');
const { parseResumeStructure } = require('../services/resumeStructureService');
const { buildExperienceBlueprint } = require('../services/resumeExperiencePerfectionService');
const { splitExperienceContentIntoJobs } = require('../services/resumeExperiencePreserveService');

const resume = `LEONIX ASONGWE
leonix23@gmail.com

PROFESSIONAL SUMMARY
Senior platform engineer with Azure and Databricks experience.

TECHNICAL SKILLS
Azure, AWS, Kubernetes, Terraform, Databricks

PROFESSIONAL EXPERIENCE
Cloud Platform Engineer
Feb 2022 – Present
Bon Secours Mercy Health
- Architected Azure Databricks environments from scratch.
- Built scalable ETL pipelines using PySpark and Delta Lake.
- Designed secure Azure network architectures for SOC 2 compliance.
DevOps Engineer
Aug 2020 – Jan 2022
Wimora Technology
- Implemented DevSecOps pipelines with SAST and DAST scanning.
- Managed Kubernetes clusters on AKS with Terraform automation.
Cloud Engineer / DevOps
Dec 2016 – Jul 2020
PRIMUS Global Services
- Built multi-account AWS environments using EC2, VPC, IAM, S3, RDS, Lambda, and CloudFormation.
- Led on-premises to cloud migration programs with SOC 2 aligned controls.

EDUCATION
Bachelor of Science Mathematics | University of Yaounde

CERTIFICATIONS
Azure DevOps Engineer Expert | CKA`;

const jd = `Mainframe DevOps Migration Consultant — SS Software Solutions

Requirements:
- 8+ years experience with mainframe modernization and DevOps
- Strong Kubernetes, Terraform, and CI/CD pipeline experience
- Azure or AWS cloud migration background required
- Nice to have: Databricks, observability, SOC 2 compliance
- CKA or Terraform Associate preferred

Responsibilities:
- Lead mainframe to cloud migration programs
- Build and secure Kubernetes platforms for enterprise clients`;

describe('jobAnalysisService', () => {
  it('extracts structured job analysis before tailoring', () => {
    const analysis = analyzeJobPosting(jd, { title: 'Mainframe DevOps Migration Consultant', company: 'SS Software Solutions' });
    assert.equal(analysis.roleTitle, 'Mainframe DevOps Migration Consultant');
    assert.equal(analysis.seniority, 'senior');
    assert.equal(analysis.yearsExperience, 8);
    assert.ok(analysis.requiredSkills.length >= 1);
    assert.ok(analysis.technologies.includes('kubernetes') || analysis.atsKeywords.includes('kubernetes'));
    assert.ok(analysis.atsKeywords.length >= 8);
    assert.ok(analysis.responsibilities.length >= 1);
  });

  it('infers seniority and years independently', () => {
    assert.equal(inferSeniority('Senior Platform Engineer with 5 years'), 'senior');
    assert.equal(extractYearsExperience('Minimum 10 years of relevant experience'), 10);
  });
});

describe('sectionTailor architecture', () => {
  it('builds editable-only payload excluding immutable sections', () => {
    const structure = parseResumeStructure(resume);
    const editable = buildEditablePayload(structure);
    const keys = editable.map((s) => s.key);
    assert.ok(keys.includes('summary'));
    assert.ok(keys.includes('experience'));
    assert.ok(keys.includes('skills'));
    assert.equal(keys.includes('education'), false);
    assert.equal(keys.includes('certifications'), false);
  });

  it('validates structured tailor JSON for job and bullet integrity', () => {
    const structure = parseResumeStructure(resume);
    const exp = structure.sections.find((s) => s.key === 'experience');
    const blueprint = buildExperienceBlueprint(splitExperienceContentIntoJobs(exp.content));

    const good = {
      summary: 'Senior platform engineer targeting Mainframe DevOps Migration Consultant with Azure, Kubernetes, and Terraform experience.',
      experience: exp.content,
      skills: 'Azure, Kubernetes, Terraform, Databricks, AWS, DevOps, CI/CD',
      changes: [{ section: 'summary', reason: 'Named target role and top JD keywords' }],
    };
    const goodValidation = validateTailorResponse(good, { structure, experienceBlueprint: blueprint });
    assert.equal(goodValidation.valid, true);

    const bad = {
      summary: 'Too short',
      experience: 'Cloud Platform Engineer\nFeb 2022 – Present\nBon Secours Mercy Health\n- One bullet only.',
      skills: 'Azure',
    };
    const badValidation = validateTailorResponse(bad, { structure, experienceBlueprint: blueprint });
    assert.equal(badValidation.valid, false);
    assert.ok(badValidation.errors.length >= 2);
    assert.ok(formatValidationErrors(badValidation).includes('Summary'));
  });
});
