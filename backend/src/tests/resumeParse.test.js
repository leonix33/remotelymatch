const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  extractSkillsFromText,
  computeResumeScore,
  mergeSkillLists,
  profileResumeAlignment,
  isDefaultOnboardingCriteria,
  isUnreadableResumeText,
} = require('../services/resumeParseService');

describe('resumeParseService', () => {
  it('extracts common platform engineering skills from resume text', () => {
    const text = `
      Platform Engineer with Kubernetes, Terraform, AWS, Azure, Docker, and Python.
      Built CI/CD pipelines and managed EKS clusters. Experience with Databricks and Prometheus.
    `;
    const { mustHave, niceToHave } = extractSkillsFromText(text);
    assert.ok(mustHave.includes('kubernetes'));
    assert.ok(mustHave.includes('terraform'));
    assert.ok(niceToHave.includes('databricks'));
    assert.ok(niceToHave.includes('prometheus'));
  });

  it('scores richer resumes higher', () => {
    const sparse = computeResumeScore({
      resumeText: 'Short resume',
      mustHaveSkills: ['aws'],
      targetTitles: ['devops engineer'],
    });
    const rich = computeResumeScore({
      resumeText: 'x'.repeat(800),
      mustHaveSkills: ['aws', 'kubernetes', 'terraform', 'python'],
      niceToHaveSkills: ['databricks', 'prometheus'],
      headline: 'Platform Engineer',
      targetTitles: ['platform engineer'],
      extractedSkills: ['aws', 'kubernetes', 'terraform', 'python', 'docker', 'linux'],
    });
    assert.ok(rich > sparse);
    assert.ok(rich >= 70);
  });

  it('merges skill lists without duplicates', () => {
    const merged = mergeSkillLists('kubernetes\naws', ['AWS', 'terraform']);
    assert.equal(merged, 'kubernetes\naws\nterraform');
  });

  it('detects when default DevOps criteria do not match a non-technical resume', () => {
    const profile = {
      resumeText:
        'Marketing Manager with 8 years in brand strategy, content marketing, SEO, and social media campaigns.',
      targetTitles: ['devops engineer', 'platform engineer', 'cloud engineer'],
      mustHaveSkills: ['kubernetes', 'terraform', 'aws', 'docker'],
      extractedSkills: [],
    };
    assert.ok(isDefaultOnboardingCriteria(profile));
    const alignment = profileResumeAlignment(profile);
    assert.equal(alignment.aligned, false);
    assert.ok(alignment.reason?.includes('resume'));
  });

  it('treats aligned DevOps resume and criteria as a match', () => {
    const profile = {
      resumeText:
        'Platform Engineer with Kubernetes, Terraform, AWS, Docker, Python, and CI/CD experience.',
      targetTitles: ['platform engineer', 'devops engineer'],
      mustHaveSkills: ['kubernetes', 'terraform', 'aws'],
      extractedSkills: ['kubernetes', 'terraform', 'aws', 'docker', 'python'],
    };
    const alignment = profileResumeAlignment(profile);
    assert.equal(alignment.aligned, true);
  });

  it('flags raw docx binary as unreadable resume text', () => {
    const corrupt = 'PK\x03\x04 ! [Content_Types].xml \x00\x01\x02 broken';
    assert.equal(isUnreadableResumeText(corrupt), true);
    assert.equal(isUnreadableResumeText('Platform Engineer with AWS, Kubernetes, and Terraform.'), false);
  });
});
