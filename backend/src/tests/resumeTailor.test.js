const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDemoKit,
  inferMissingKeywords,
  formatKitAsText,
  enrichKitForDisplay,
} = require('../services/resumeTailorService');

describe('resumeTailorService', () => {
  const profile = {
    displayName: 'Alex Rivera',
    resumeText: 'Senior DevOps engineer with Terraform, AWS, and Kubernetes in production.',
    mustHaveSkills: ['terraform', 'aws', 'kubernetes'],
    targetTitles: ['devops engineer'],
  };
  const contact = { name: 'Alex Rivera', email: 'alex@personal.com', phone: '', linkedin: '' };

  const job = { title: 'Platform Engineer', company: 'Acme', matchPct: 82 };
  const jd = 'We need Terraform, AWS, Kubernetes, and Istio service mesh experience.';

  it('detects keywords present in JD but absent from resume', () => {
    const missing = inferMissingKeywords(profile, jd);
    assert.ok(missing.includes('istio'));
    assert.ok(!missing.includes('terraform'));
  });

  it('builds full tailored resume demo preserving structure', () => {
    const profileWithCerts = {
      ...profile,
      resumeText: `Alex Rivera\nalex@email.com\n\nEXPERIENCE\nSenior DevOps Engineer — Acme\n- Managed Kubernetes clusters\n\nCERTIFICATIONS\nAWS Solutions Architect Associate\nTerraform Associate`,
    };
    const kit = buildDemoKit(profileWithCerts, job, jd, contact, { supplementPages: 3, tailorMode: 'high_match' });
    assert.equal(kit.mode, 'full_resume');
    assert.equal(kit.contactEmail, 'alex@personal.com');
    assert.ok(kit.pageCount >= 1);
    assert.ok(kit.tailoredResumeText.includes('AWS Solutions Architect'));
    assert.ok(kit.tailoredResumeText.includes('Terraform Associate'));
    assert.ok(kit.tailoredResumeText.indexOf('EXPERIENCE') < kit.tailoredResumeText.indexOf('CERTIFICATIONS'));
    assert.ok(kit.resumeStructure?.sectionHeadings?.includes('EXPERIENCE'));
    assert.ok(!kit.tailoredResumeText.toLowerCase().includes('addendum'));
    assert.ok(!kit.tailoredResumeText.toLowerCase().includes('ats keyword'));
    assert.ok(kit.coverLetterParagraph.includes('Platform Engineer'));
    assert.ok(!kit.coverLetterParagraph.toLowerCase().includes('excited to'));
  });

  it('respects explicit page target without inflating from resume length', () => {
    const { inferResumePageTarget } = require('../services/resumeTailorService');
    const longResume = 'word '.repeat(2000);
    assert.equal(inferResumePageTarget(longResume, 2), 2);
    assert.equal(inferResumePageTarget(longResume, 5), 5);
  });

  it('formats kit as clean resume text', () => {
    const kit = buildDemoKit(profile, job, jd, contact);
    const text = formatKitAsText(kit);
    assert.ok(!text.includes('APPLICATION KIT'));
    assert.ok(!text.includes('ADDENDUM'));
    assert.ok(text.length > 50);
  });

  it('enrichKitForDisplay repairs legacy chunky tools sections', () => {
    const legacy = {
      tailored: true,
      pageCount: 1,
      supplementPagesTarget: 3,
      tailoredResumeText: `PROFESSIONAL EXPERIENCE
DevOps Engineer Aug 2020 Jan 2022 Wimora Technology
Implemented DevSecOps pipelines, by integrating security scanning
TOOLS
into CI/CD pipelines as mandatory gates, ensuring vulnerabilities were caught before production deployment.
Cloud Engineer / DevOps Dec 2016 Jul 2020 PRIMUS Global Services
Built multi-account AWS environments using EC2, VPC, IAM, S3, RDS, Lambda, and CloudFormation.`,
    };
    const enriched = enrichKitForDisplay(legacy);
    assert.ok(!/\nTOOLS\n/i.test(enriched.tailoredResumeText));
    assert.ok(enriched.tailoredResumeText.includes('into CI/CD pipelines'));
    assert.ok(enriched.tailoredResumeText.includes('PRIMUS Global Services'));
  });

  it('enrichKitForDisplay accepts a profile object instead of resume text', () => {
    const profile = {
      resumeText: `Alex Rivera\nalex@example.com\n\nPROFESSIONAL EXPERIENCE\nDevOps Engineer — Acme\n- Kubernetes and Terraform`,
    };
    const kit = {
      tailored: true,
      pageCount: 1,
      supplementPagesTarget: 3,
      tailoredResumeText: `${profile.resumeText}\n- Added JD keyword coverage bullet`,
    };
    const enriched = enrichKitForDisplay(kit, profile);
    assert.ok(enriched.tailoredResumeText.includes('Alex Rivera'));
    assert.ok(enriched.tailoredResumeText.includes('Kubernetes'));
  });
});

describe('applicationKitService attachKitToApplyItem', () => {
  const applicationKitStore = require('../services/applicationKitStore');
  const { attachKitToApplyItem } = require('../services/applicationKitService');

  it('skips kit fields when useTailoredResume is false', async () => {
    const job = { id: 'job-1', title: 'SRE', company: 'Acme' };
    const result = await attachKitToApplyItem('user-1', job, { useTailoredResume: false });
    assert.equal(result.use_tailored_resume, false);
    assert.equal(result.cover_letter, undefined);
  });

  it('skips kit when user opted out of using it on apply', async () => {
    await applicationKitStore.set('user-opt', 'job-opt', {
      tailored: true,
      useForApply: false,
      coverLetterParagraph: 'Should not attach',
      fullSupplementText: 'Hidden',
      pageCount: 3,
    });
    const result = await attachKitToApplyItem('user-opt', { id: 'job-opt', title: 'DevOps' }, { useTailoredResume: true });
    assert.equal(result.use_tailored_resume, false);
    assert.equal(result.cover_letter, undefined);
  });
});
