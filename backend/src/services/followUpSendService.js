const profileService = require('./profileService');
const applicantContactService = require('./applicantContactService');
const applicationKitStore = require('./applicationKitStore');
const followUpKitStore = require('./followUpKitStore');
const followUpDraftService = require('./followUpDraftService');
const emailService = require('./emailService');
const { pickBestRecipient } = require('./contactRankingService');

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

function buildAttachments(applicationKit, profile) {
  const attachments = [];
  const resumeText =
    applicationKit?.tailoredResumeText ||
    applicationKit?.fullSupplementText ||
    profile?.resumeText ||
    '';
  if (resumeText.trim()) {
    attachments.push({
      filename: 'Resume.txt',
      content: Buffer.from(resumeText.trim(), 'utf8').toString('base64'),
    });
  }
  const coverLetter = applicationKit?.coverLetterParagraph || '';
  if (coverLetter.trim()) {
    attachments.push({
      filename: 'Cover-letter.txt',
      content: Buffer.from(coverLetter.trim(), 'utf8').toString('base64'),
    });
  }
  return attachments;
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

async function resolveFollowUpKit(userId, jobId, authEmail) {
  let kit = followUpKitStore.get(userId, jobId);
  if (!kit) {
    kit = await followUpDraftService.getOrGenerate(userId, jobId, { authEmail });
  }
  return kit;
}

async function sendFollowUpOutreach(userId, jobId, options = {}) {
  const profile = await profileService.getOrCreate(userId);
  const applicant = await applicantContactService.resolveApplicantContact(userId, profile, options.authEmail);
  if (!applicant.email) {
    const err = new Error('Add your personal email in Profile → Email & follow-ups before sending.');
    err.status = 400;
    throw err;
  }

  const kit = await resolveFollowUpKit(userId, jobId, options.authEmail);
  const applicationKit = await applicationKitStore.get(userId, jobId);

  const pool = [
    ...(kit.contacts?.recommendedContacts || []),
    ...(kit.contacts?.verifiedContacts || []),
  ];
  const picked = options.recipientEmail
    ? pool.find((c) => c.email === options.recipientEmail) || {
        email: options.recipientEmail,
        name: options.recipientName || '',
        verified: false,
        source: 'manual',
      }
    : pickBestRecipient(pool);

  if (!picked?.email) {
    const err = new Error('No trusted recruiter email found — refresh contacts or pick someone from the list.');
    err.status = 400;
    throw err;
  }

  const recipientName = options.recipientName || picked.name || '';
  const coverLetter = applicationKit?.coverLetterParagraph || '';
  const emailBody = personalizeBody(kit.emailBody || '', recipientName);
  const text = [coverLetter, emailBody].filter(Boolean).join('\n\n');
  const attachments = buildAttachments(applicationKit, profile);

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
  };
}

module.exports = { sendFollowUpOutreach, personalizeBody, buildAttachments };
