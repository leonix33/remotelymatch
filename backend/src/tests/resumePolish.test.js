const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  polishTailoredResumeText,
  stripJdEcho,
  trimExperienceBullets,
  bulletSimilarity,
} = require('../services/resumePolishService');

describe('resumePolishService', () => {
  it('strips JD echo suffixes from bullets', () => {
    const line = '- Built K8s platform — aligned with requirements for Terraform and AWS in production';
    assert.ok(!stripJdEcho(line).includes('aligned with'));
    assert.ok(stripJdEcho(line).includes('Built K8s platform'));
  });

  it('removes near-duplicate bullets and caps count per role', () => {
    const lines = [
      'Senior Engineer — Acme — 2020–Present',
      '- Led Kubernetes migrations on AWS for production workloads',
      '- Led Kubernetes migrations on AWS for production systems',
      '- Owned Terraform modules for EKS clusters',
      '- Maintained CI/CD pipelines with Jenkins',
      '- Debugged on-call incidents across services',
      '- Wrote runbooks for incident response',
    ];
    const trimmed = trimExperienceBullets(lines);
    const bullets = trimmed.filter((l) => l.trim().startsWith('-'));
    assert.ok(bullets.length <= 6);
    assert.ok(bulletSimilarity(bullets[0], bullets[1]) < 0.68 || bullets.length < 2);
  });

  it('polishes full resume text and shortens bulky summary', () => {
    const text = `SUMMARY
Line one about platform engineering with Kubernetes.
Line two repeating Kubernetes and Terraform again.
Line three more filler about the job posting requirements.
Line four should be dropped.

EXPERIENCE
DevOps — Corp — 2019–Present
- Built platforms with Kubernetes, Terraform, AWS, Docker, and Jenkins for everything — aligned with your posting requirements for cloud native work`;

    const polished = polishTailoredResumeText(text, 'Requirements: Kubernetes Terraform AWS');
    const summaryLines = polished.split('EXPERIENCE')[0].split('\n').filter((l) => l.trim() && !/^summary/i.test(l.trim()));
    assert.ok(summaryLines.length <= 3);
    assert.ok(!polished.includes('aligned with your posting'));
  });
});
