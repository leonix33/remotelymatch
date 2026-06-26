const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDemoKit,
  inferMissingKeywords,
  formatKitAsText,
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
      resumeText: `Alex Rivera\nalex@email.com\n\nEXPERIENCE\nSenior DevOps Engineer — Acme\n\nCERTIFICATIONS\nAWS Solutions Architect Associate\nTerraform Associate`,
    };
    const kit = buildDemoKit(profileWithCerts, job, jd, contact, { supplementPages: 3, tailorMode: 'high_match' });
    assert.equal(kit.mode, 'full_resume');
    assert.equal(kit.contactEmail, 'alex@personal.com');
    assert.ok(kit.pageCount >= 2);
    assert.ok(kit.tailoredResumeText.includes('AWS Solutions Architect'));
    assert.ok(kit.tailoredResumeText.includes('Terraform Associate'));
    assert.ok(!kit.tailoredResumeText.toLowerCase().includes('addendum'));
    assert.ok(!kit.tailoredResumeText.toLowerCase().includes('ats keyword'));
    assert.ok(kit.coverLetterParagraph.includes('Platform Engineer'));
    assert.ok(!kit.coverLetterParagraph.toLowerCase().includes('excited to'));
  });

  it('formats kit as clean resume text', () => {
    const kit = buildDemoKit(profile, job, jd, contact);
    const text = formatKitAsText(kit);
    assert.ok(!text.includes('APPLICATION KIT'));
    assert.ok(!text.includes('ADDENDUM'));
    assert.ok(text.length > 50);
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
