const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildAttachments, assertTailoredKitReady } = require('../services/followUpSendService');

describe('follow-up send gating', () => {
  it('rejects attachments without tailored kit', () => {
    assert.throws(() => buildAttachments({ tailored: false }), /Polish your application kit/);
    assert.throws(() => buildAttachments({ tailored: true, tailoredResumeText: 'resume' }), /cover letter is missing/);
  });

  it('requires job-ready ATS before send', () => {
    assert.throws(
      () => assertTailoredKitReady({ tailored: true, atsScore: 70, jdMatchPct: 60 }),
      /Polish kit until ATS/
    );
    assert.doesNotThrow(() =>
      assertTailoredKitReady({ tailored: true, atsScore: 96, jdMatchPct: 82 })
    );
  });

  it('builds attachments from tailored kit only', () => {
    const files = buildAttachments({
      tailored: true,
      company: 'Lemon.io',
      tailoredResumeText: 'Tailored resume body',
      coverLetterParagraph: 'Tailored cover letter',
    });
    assert.equal(files.length, 2);
    assert.match(files[0].filename, /Resume-Lemon-io/);
  });
});
