const profileService = require('./profileService');
const applicantContactService = require('./applicantContactService');
const applicationKitStore = require('./applicationKitStore');
const followUpDraftService = require('./followUpDraftService');
const emailService = require('./emailService');
const { pickBestRecipient } = require('./contactRankingService');
const { isKitReadyToApply, READY_ATS_MIN } = require('./kitReadinessService');
const activityService = require('./activityService');

function firstName(name = '') {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function personalizeBody(body = '', recipientName = '') {
  if (!recipientName) return body;
  const greeting = `Hi ${firstName(recipientName)},`;
  if (/^hi[,.]?\s/i.test(body)) {
    return body.replace(/^hi[^,\n]*,?\s*/i, `${greeting}\n\n`);
  }
  return `${greeting}\n\n${body}`;
}

function buildAttachments(applicationKit) {
  if (!applicationKit?.tailored) {
    const err = new Error('Polish your application kit for this role before sending — only JD-tailored resume and cover letter are attached.');
    err.status = 400;
    throw err;
  }

  const resumeText = applicationKit.tailoredResumeText || applicationKit.fullSupplementText || '';
  const coverLetter = applicationKit.coverLetterParagraph || '';
  if (!resumeText.trim() || !coverLetter.trim()) {
    const err = new Error('Tailored resume or cover letter is missing — run Polish kit for apply, then regenerate the follow-up kit.');
    err.status = 400;
    throw err;
  }

  const companySlug = String(applicationKit.company || 'role')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  return [
    {
      filename: `Resume-${companySlug || 'tailored'}.txt`,
      content: Buffer.from(resumeText.trim(), 'utf8').toString('base64'),
    },
    {
      filename: `Cover-letter-${companySlug || 'tailored'}.txt`,
      content: Buffer.from(coverLetter.trim(), 'utf8').toString('base64'),
    },
  ];
}

function assertTailoredKitReady(applicationKit) {
  const summary = {
    tailored: Boolean(applicationKit?.tailored),
    hasKit: Boolean(applicationKit?.tailored),
    useForApply: applicationKit?.useForApply !== false,
    atsScore: applicationKit?.atsScore ?? null,
    jdMatchPct: applicationKit?.jdMatchPct ?? null,
    recruiterReady: Boolean(applicationKit?.recruiterReady),
    atsReady: Boolean(applicationKit?.atsReady),
  };
  if (!isKitReadyToApply(summary)) {
    const err = new Error(
      `Polish kit until ATS is at least ${READY_ATS_MIN}% (target 100%) before sending — current ATS ${summary.atsScore ?? '—'}%.`
    );
    err.status = 400;
    throw err;
  }
}

function buildHtml({ applicant, recipientName, coverLetter, emailBody, job }) {
  const coverBlock = coverLetter
    ? `<p style="color:#cbd5e1;line-height:1.6;margin:0 0 16px">${escapeHtml(coverLetter)}</p>`
    : '';
  const bodyHtml = String(emailBody || '')
    .split('\n')
    .map(
      (line) =>
        `<p style="color:#cbd5e1;line-height:1.6;margin:0 0 12px">${line ? escapeHtml(line) : '&nbsp;'}</p>`
    )
    .join('');

  return `<div style="font-family:system-ui,sans-serif;max-width:640px;color:#e2e8f0">
    <p style="color:#94a3b8;font-size:12px;margin:0 0 20px">Follow-up · ${escapeHtml(job.title || 'Role')} at ${escapeHtml(job.company || 'Company')}</p>
    ${coverBlock}
    ${bodyHtml}
    <p style="color:#94a3b8;font-size:12px;margin-top:24px;border-top:1px solid #334155;padding-top:16px">
      ${escapeHtml(applicant.name || 'Applicant')}${applicant.email ? ` · ${escapeHtml(applicant.email)}` : ''}${applicant.phone ? ` · ${escapeHtml(applicant.phone)}` : ''}
    </p>
  </div>`;
}

async function sendFollowUpOutreach(userId, jobId, options = {}) {
  const profile = await profileService.getOrCreate(userId);
  const applicant = await applicantContactService.resolveApplicantContact(userId, profile, options.authEmail);
  if (!applicant.email) {
    const err = new Error('Add your personal email in Profile → Email & follow-ups before sending.');
    err.status = 400;
    throw err;
  }

  const applicationKit = await applicationKitStore.get(userId, jobId);
  assertTailoredKitReady(applicationKit);

  const kit = await followUpDraftService.generateFollowUpKit(userId, jobId, {
    authEmail: options.authEmail,
    kit: applicationKit,
    daysSinceApply: options.daysSinceApply,
  });

  const pool = [
    ...(kit.contacts?.recommendedContacts || []),
    ...(kit.contacts?.verifiedContacts || []),
  ];
  const picked = options.recipientEmail
    ? pool.find((c) => c.email === options.recipientEmail) || {
        email: options.recipientEmail,
        name: options.recipientName || '',
        verified: false,
        recommended: false,
        source: 'manual',
      }
    : pickBestRecipient(pool);

  if (!picked?.email) {
    const err = new Error('No trusted recruiter email found — refresh contacts or pick someone from the list.');
    err.status = 400;
    throw err;
  }

  const recipientName = options.recipientName || picked.name || '';
  const coverLetter = applicationKit.coverLetterParagraph || '';
  const emailBody = personalizeBody(kit.emailBody || '', recipientName);
  const text = [coverLetter, emailBody].filter(Boolean).join('\n\n');
  const attachments = buildAttachments(applicationKit);

  const result = await emailService.sendEmail({
    to: picked.email,
    subject: kit.emailSubject || `Following up — ${kit.title || 'application'}`,
    html: buildHtml({
      applicant,
      recipientName,
      coverLetter,
      emailBody,
      job: kit,
    }),
    text,
    replyTo: applicant.email,
    attachments,
  });

  if (!result.sent) {
    const err = new Error(result.reason || 'Email provider rejected the send');
    err.status = 502;
    throw err;
  }

  await activityService.recordActivity({
    req: options.req,
    userId,
    type: 'follow_up_send',
    entityType: 'job',
    entityId: jobId,
    summary: `Follow-up sent to ${picked.email}`,
    meta: {
      to: picked.email,
      recipientName,
      company: kit.company,
      title: kit.title,
      atsScore: applicationKit.atsScore ?? null,
    },
  });

  return {
    sent: true,
    to: picked.email,
    recipientName,
    replyTo: applicant.email,
    attachments: attachments.map((a) => a.filename),
    provider: result.provider,
    recommended: Boolean(picked.recommended),
    verified: Boolean(picked.verified),
    trustScore: picked.trustScore ?? null,
    atsScore: applicationKit.atsScore ?? null,
    jdTailored: true,
  };
}

module.exports = { sendFollowUpOutreach, personalizeBody, buildAttachments, assertTailoredKitReady };
