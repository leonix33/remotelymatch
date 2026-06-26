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

  it('builds additive demo kit without rewriting resume', () => {
    const kit = buildDemoKit(profile, job, jd, contact, { supplementPages: 4, tailorMode: 'high_match' });
    assert.equal(kit.mode, 'additive');
    assert.equal(kit.contactEmail, 'alex@personal.com');
    assert.ok(kit.pageCount >= 4);
    assert.equal(kit.tailorMode, 'high_match');
    assert.ok(kit.guardrails.toLowerCase().includes('unchanged') || kit.guardrails.length > 0);
    assert.ok(Array.isArray(kit.additiveBullets));
    assert.ok(kit.coverLetterParagraph.includes('Platform Engineer'));
    assert.ok(!kit.coverLetterParagraph.toLowerCase().includes('excited to'));
    assert.ok(kit.fullSupplementText.includes('alex@personal.com'));
  });

  it('formats kit as readable text', () => {
    const kit = buildDemoKit(profile, job, jd, contact);
    const text = formatKitAsText(kit);
    assert.ok(text.includes('APPLICATION KIT'));
    assert.ok(text.includes('additive'));
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
