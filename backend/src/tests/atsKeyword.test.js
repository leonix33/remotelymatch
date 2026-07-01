const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  scoreAtsKeywords,
  extractJdTerms,
  buildAtsTips,
  getRedTerms,
  extractPrioritySectionLines,
  scoreJdRequirementCoverage,
} = require('../services/atsKeywordService');
const { applyAtsMetadata, buildDemoKit } = require('../services/resumeTailorService');

describe('atsKeywordService', () => {
  const jd = `Platform Engineer at Acme

Requirements:
- 5+ years Kubernetes and Terraform in production
- Strong AWS and observability (Prometheus, Grafana)
- Experience with CI/CD pipelines and on-call rotation`;

  const resume =
    'Senior DevOps engineer with Terraform, AWS, Kubernetes, Prometheus, and Grafana in production CI/CD environments.';

  it('extracts priority section lines from requirements block', () => {
    const lines = extractPrioritySectionLines(jd);
    assert.ok(lines.some((l) => l.toLowerCase().includes('kubernetes')));
    assert.ok(lines.some((l) => l.toLowerCase().includes('terraform')));
  });

  it('scores tailored resume against JD terms', () => {
    const ats = scoreAtsKeywords({ tailoredText: resume, jobDescription: jd });
    assert.ok(ats.score >= 0 && ats.score <= 100);
    assert.ok(ats.green >= 3);
    assert.ok(ats.termCount > 5);
    assert.ok(ats.breakdown.some((b) => b.term === 'kubernetes' && b.status === 'green'));
  });

  it('builds actionable ATS tips', () => {
    const ats = scoreAtsKeywords({ tailoredText: 'basic resume', jobDescription: jd });
    const tips = buildAtsTips(ats);
    assert.ok(tips.length >= 2);
    assert.ok(tips.some((t) => t.includes('ATS')));
  });

  it('returns red terms for refinement pass', () => {
    const ats = scoreAtsKeywords({ tailoredText: 'basic resume', jobDescription: jd });
    const red = getRedTerms(ats, 5);
    assert.ok(red.length > 0);
    assert.ok(red.every((t) => typeof t === 'string'));
  });
});

describe('jd requirement coverage', () => {
  it('scores how well resume reflects posting requirements', () => {
    const jd = `Requirements:
- 5+ years Kubernetes and Terraform in production
- Strong AWS observability with Prometheus
- Experience with CI/CD pipelines`;
    const resume = 'Senior engineer with Kubernetes, Terraform, AWS, Prometheus, and CI/CD in production.';
    const coverage = scoreJdRequirementCoverage(resume, jd, { title: 'Platform Engineer' });
    assert.ok(coverage.jdRequirementsTotal >= 1);
    assert.ok(coverage.jdMatchPct >= 0);
  });
});

describe('applyAtsMetadata', () => {
  it('attaches real ATS score to demo kit', () => {
    const profile = {
      displayName: 'Alex',
      resumeText: 'EXPERIENCE\nDevOps — Acme\n- Kubernetes and Terraform on AWS',
      mustHaveSkills: ['terraform', 'aws'],
    };
    const job = { title: 'Platform Engineer', company: 'Acme' };
    const jd = 'Requirements: Kubernetes, Terraform, AWS, Prometheus';
    const kit = buildDemoKit(profile, job, jd, { email: 'a@b.com' }, { tailorMode: 'high_match' });
    assert.ok(typeof kit.atsScore === 'number');
    assert.ok(Array.isArray(kit.atsTips));
    assert.ok(typeof kit.atsScore === 'number');
    assert.ok(typeof kit.jdMatchPct === 'number');
    assert.ok(Array.isArray(kit.atsTips));
    assert.ok(kit.estimatedMatchPct <= 100);
  });
});
