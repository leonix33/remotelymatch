const env = require('../config/env');
const User = require('../models/User');

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null;
}

const DOMAIN_STATUS_TTL_MS = 5 * 60 * 1000;
let domainStatusCache = { at: 0, value: null };
let gmailTransport = null;

function hasGmailSmtp() {
  return Boolean(env.gmailSmtpUser && env.gmailSmtpPass && nodemailer);
}

function hasResend() {
  return Boolean(env.resendApiKey);
}

function isEmailConfigured() {
  return hasGmailSmtp() || hasResend();
}

function getGmailTransport() {
  if (!hasGmailSmtp()) return null;
  if (!gmailTransport) {
    gmailTransport = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: env.gmailSmtpUser,
        pass: env.gmailSmtpPass,
      },
    });
  }
  return gmailTransport;
}

function maskEmail(email = '') {
  const raw = String(email || '').trim();
  if (!raw.includes('@')) return raw ? '***' : null;
  const [user, domain] = raw.split('@');
  return `${user.slice(0, 3)}***@${domain}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loginUrl() {
  const base = env.appUrl.replace(/\/$/, '');
  return `${base}/login`;
}

function parseFromAddress(from = env.emailFrom) {
  const raw = String(from || '').trim();
  const match = raw.match(/<([^>]+)>/);
  const email = (match ? match[1] : raw).trim().toLowerCase();
  const domain = email.includes('@') ? email.split('@')[1] : '';
  return { raw, email, domain };
}

function isSandboxFrom(from = env.emailFrom) {
  return parseFromAddress(from).domain === 'resend.dev';
}

function parseResendError(bodyText) {
  let reason = bodyText;
  try {
    const parsed = JSON.parse(bodyText);
    reason = parsed.message || parsed.error || bodyText;
  } catch {
    // keep raw text
  }
  if (/only send testing emails to your own email address/i.test(reason)) {
    return 'Resend sandbox: verify remotelymatch.app in Resend Domains, or use onboarding@resend.dev only for your Resend signup email.';
  }
  if (/domain.*not verified|verify a domain/i.test(reason)) {
    return 'Resend domain not verified — add DNS records at your registrar and verify remotelymatch.app in Resend.';
  }
  return reason;
}

async function resendFetch(path, options = {}) {
  if (!env.resendApiKey) return { ok: false, status: 0, body: 'Resend API key not configured' };
  const res = await fetch(`https://api.resend.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

async function getResendDomainStatus(domain = env.customDomain) {
  if (!env.resendApiKey) {
    return { configured: false, domain, status: 'not_configured', deliveryReady: false };
  }

  const target = String(domain || '').trim().toLowerCase();
  if (!target) {
    return { configured: true, domain: null, status: 'missing_domain', deliveryReady: false };
  }

  if (isSandboxFrom()) {
    return {
      configured: true,
      domain: target,
      status: 'sandbox',
      deliveryReady: true,
      note: 'Sandbox sender only delivers to your Resend signup email.',
    };
  }

  const now = Date.now();
  if (domainStatusCache.value && now - domainStatusCache.at < DOMAIN_STATUS_TTL_MS) {
    return domainStatusCache.value;
  }

  const { ok, body } = await resendFetch('/domains');
  if (!ok) {
    const value = {
      configured: true,
      domain: target,
      status: 'api_error',
      deliveryReady: false,
      error: parseResendError(body),
    };
    domainStatusCache = { at: now, value };
    return value;
  }

  let list = [];
  try {
    const parsed = JSON.parse(body);
    list = parsed.data || parsed || [];
  } catch {
    list = [];
  }

  const row = list.find((d) => String(d.name || d.domain || '').toLowerCase() === target);
  if (!row) {
    const value = {
      configured: true,
      domain: target,
      status: 'not_added',
      deliveryReady: false,
      error: `Domain ${target} is not added in Resend — open resend.com/domains and add it.`,
    };
    domainStatusCache = { at: now, value };
    return value;
  }

  const status = String(row.status || row.verification?.status || 'unknown').toLowerCase();
  const value = {
    configured: true,
    domain: target,
    status,
    deliveryReady: status === 'verified',
    error: status === 'verified' ? null : `Domain ${target} is ${status} in Resend — finish DNS verification.`,
  };
  domainStatusCache = { at: now, value };
  return value;
}

async function getEmailDiagnostics() {
  const from = parseFromAddress();
  const sandbox = isSandboxFrom();
  const domainStatus = sandbox
    ? {
        configured: Boolean(env.resendApiKey),
        domain: env.customDomain,
        status: 'sandbox',
        deliveryReady: Boolean(env.resendApiKey),
        note: 'Sandbox sender only delivers to your Resend signup email.',
      }
    : await getResendDomainStatus(from.domain || env.customDomain);

  return {
    emailConfigured: isEmailConfigured(),
    emailFrom: env.emailFrom || null,
    emailProduction: Boolean(hasResend() && !sandbox),
    emailSandbox: sandbox,
    emailDomain: from.domain || env.customDomain || null,
    emailDomainStatus: domainStatus.status,
    emailDeliveryReady: Boolean(hasGmailSmtp() || (hasResend() && domainStatus.deliveryReady)),
    emailDomainError: domainStatus.error || null,
    emailDomainNote: domainStatus.note || null,
    gmailSmtpConfigured: hasGmailSmtp(),
    gmailSmtpUser: maskEmail(env.gmailSmtpUser),
    teamEmail: env.teamEmail || null,
    gmailUsesTeamMailbox:
      !env.gmailSmtpUser ||
      !env.teamEmail ||
      env.gmailSmtpUser.toLowerCase() === env.teamEmail.toLowerCase(),
    emailPrimaryProvider: hasGmailSmtp() ? 'gmail' : hasResend() ? 'resend' : null,
    emailProviders: [hasGmailSmtp() ? 'gmail' : null, hasResend() ? 'resend' : null].filter(Boolean),
  };
}

async function sendViaGmail({ to, subject, html, text, replyTo, attachments = [] }) {
  const transport = getGmailTransport();
  if (!transport) return { sent: false, reason: 'Gmail SMTP not configured', provider: 'gmail' };
  try {
    const info = await transport.sendMail({
      from: `"${env.appName}" <${env.gmailSmtpUser}>`,
      to,
      replyTo: replyTo || undefined,
      subject,
      html,
      text: text || undefined,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, 'base64'),
      })),
    });
    return { sent: true, id: info.messageId || null, provider: 'gmail' };
  } catch (err) {
    console.error('Gmail SMTP send failed:', err.message);
    return { sent: false, reason: err.message, provider: 'gmail' };
  }
}

async function sendViaResend({ to, subject, html, text, replyTo, attachments = [] }) {
  if (!hasResend()) return { sent: false, reason: 'Resend not configured', provider: 'resend' };

  const payload = {
    from: env.emailFrom,
    to: [to],
    subject,
    html,
  };
  if (text) payload.text = text;
  if (replyTo) payload.reply_to = replyTo;
  if (attachments.length) {
    payload.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
    }));
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    const reason = parseResendError(err);
    console.error('Resend send failed:', reason);
    return { sent: false, reason, provider: 'resend' };
  }

  let id = null;
  try {
    const parsed = await res.json();
    id = parsed.id || null;
  } catch {
    // ignore
  }
  return { sent: true, id, provider: 'resend' };
}

async function sendEmail({ to, subject, html, text, replyTo, attachments = [] }) {
  if (!to) return { sent: false, reason: 'No recipient email' };
  if (!isEmailConfigured()) {
    return {
      sent: false,
      reason: 'No email provider configured — add GMAIL_SMTP_USER/PASS or RESEND_API_KEY on Render',
    };
  }

  const attempts = [];
  if (hasGmailSmtp()) attempts.push(sendViaGmail);
  if (hasResend()) attempts.push(sendViaResend);

  const errors = [];
  for (const attempt of attempts) {
    const result = await attempt({ to, subject, html, text, replyTo, attachments });
    if (result.sent) return result;
    errors.push(`${result.provider}: ${result.reason}`);
  }

  return { sent: false, reason: errors.join(' · ') };
}

async function getResendEmailStatus(id) {
  if (!env.resendApiKey || !id) return null;
  const { ok, body } = await resendFetch(`/emails/${encodeURIComponent(id)}`);
  if (!ok) return { status: 'unknown', error: parseResendError(body) };
  try {
    const parsed = JSON.parse(body);
    return {
      status: String(parsed.last_event || parsed.status || 'unknown').toLowerCase(),
      createdAt: parsed.created_at || null,
    };
  } catch {
    return { status: 'unknown', error: body };
  }
}

async function sendTestEmail(to) {
  const recipient = String(to || env.adminEmail || '').trim();
  if (!recipient) {
    return { sent: false, reason: 'No recipient email provided' };
  }

  const diagnostics = await getEmailDiagnostics();
  if (!diagnostics.emailConfigured) {
    return {
      sent: false,
      reason: 'No email provider configured — add GMAIL_SMTP_USER/PASS or RESEND_API_KEY on Render',
      diagnostics,
    };
  }

  const senderLabel = diagnostics.gmailSmtpConfigured
    ? `Gmail (${diagnostics.gmailSmtpUser})`
    : env.emailFrom;

  const text = [
    `${env.appName} — email delivery test`,
    '',
    `This is a test from ${senderLabel}.`,
    'If you received this, password resets, invites, and application summaries will reach this inbox.',
    '',
    `Log in: ${env.appUrl.replace(/\/$/, '')}/login`,
  ].join('\n');

  const result = await sendEmail({
    to: recipient,
    subject: `${env.appName} — please confirm you received this`,
    text,
    html: wrapHtml(
      'Email delivery test',
      `If you are reading this, <strong>${escapeHtml(env.appName)}</strong> can reach <strong>${escapeHtml(recipient)}</strong>.<br><br>Sender: <strong>${escapeHtml(senderLabel)}</strong><br><br>Invites, password resets, and application traction summaries use this same delivery path.`,
      '/login'
    ),
  });

  let deliveryStatus = null;
  if (result.provider === 'resend' && result.id) {
    deliveryStatus = await getResendEmailStatus(result.id);
  } else if (result.sent && result.provider === 'gmail') {
    deliveryStatus = { status: 'sent_via_gmail', note: 'Gmail SMTP accepted the message — check inbox and spam.' };
  }

  return { ...result, diagnostics, to: recipient, deliveryStatus };
}

async function sendToUser(userId, subject, html) {
  if (!env.mongoUri) return { sent: false };
  const user = await User.findById(userId).select('email name');
  if (!user?.email) return { sent: false };
  return sendEmail({ to: user.email, subject, html });
}

function wrapHtml(title, body, link) {
  const appUrl = env.appUrl;
  const name = env.appName;
  const cta = link ? `<p><a href="${appUrl}${link}" style="color:#2dd4bf">Open in ${name} →</a></p>` : '';
  return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#e2e8f0;background:#0f172a;padding:24px;border-radius:12px">
    <h2 style="color:#5eead4;margin:0 0 12px">${title}</h2>
    <p style="color:#94a3b8;line-height:1.5">${body}</p>
    ${cta}
    <p style="color:#475569;font-size:12px;margin-top:24px">${name} · ${appUrl}</p>
  </div>`;
}

async function notifyHighMatch(userId, { title, company, matchPct }) {
  return sendToUser(
    userId,
    `🔥 ${matchPct}% match: ${title}`,
    wrapHtml('High-match job alert', `<strong>${title}</strong> at ${company} — ${matchPct}% personal match. Review in your apply queue.`, '/approvals')
  );
}

async function notifyChatInvite(userId, { fromName, intro }) {
  return sendToUser(
    userId,
    `${fromName} wants to chat on ${env.appName}`,
    wrapHtml('New chat invite', `${fromName} sent you a message request.${intro ? `<br><br><em>"${intro}"</em>` : ''}`, '/chat')
  );
}

async function notifyInterviewReminder(userId, { title, when, location }) {
  return sendToUser(
    userId,
    `Reminder: ${title}`,
    wrapHtml('Upcoming event', `<strong>${title}</strong><br>${when}${location ? `<br>${location}` : ''}`, '/calendar')
  );
}

function credentialsHtml({ email, password }) {
  return `<div style="margin:16px 0;padding:16px;border-radius:8px;background:#1e293b;border:1px solid #334155">
    <p style="margin:0 0 8px;color:#94a3b8;font-size:13px">Sign in with:</p>
    <p style="margin:0 0 6px;color:#e2e8f0"><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p style="margin:0;color:#e2e8f0"><strong>Temporary password:</strong> <code style="color:#5eead4">${escapeHtml(password)}</code></p>
  </div>`;
}

async function notifyTeamInvite({ to, name, email, password, invitedByName }) {
  const login = loginUrl();
  const inviter = invitedByName ? escapeHtml(invitedByName) : 'Your team admin';
  const body = `
    Hi ${escapeHtml(name)},<br><br>
    ${inviter} invited you to <strong>${escapeHtml(env.appName)}</strong> — AI-powered remote job intelligence for your team.
    ${credentialsHtml({ email, password })}
    <p style="margin:0;color:#94a3b8;font-size:13px">Use this password for your first login. You can change it later from your profile.</p>
  `;
  return sendEmail({
    to,
    subject: `You're invited to ${env.appName}`,
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#e2e8f0;background:#0f172a;padding:24px;border-radius:12px">
      <h2 style="color:#5eead4;margin:0 0 12px">Welcome to ${escapeHtml(env.appName)}</h2>
      <p style="color:#94a3b8;line-height:1.5">${body}</p>
      <p style="margin:20px 0 0"><a href="${login}" style="display:inline-block;background:#14b8a6;color:#0f172a;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Log in to ${escapeHtml(env.appName)}</a></p>
      <p style="color:#475569;font-size:12px;margin-top:24px">${escapeHtml(env.appName)} · ${escapeHtml(login)}</p>
    </div>`,
  });
}

async function notifyPasswordReset({ to, name, email, password }) {
  const login = loginUrl();
  const body = `
    Hi ${escapeHtml(name)},<br><br>
    Your ${escapeHtml(env.appName)} password was reset by an admin.
    ${credentialsHtml({ email, password })}
  `;
  return sendEmail({
    to,
    subject: `Your ${env.appName} password was reset`,
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#e2e8f0;background:#0f172a;padding:24px;border-radius:12px">
      <h2 style="color:#5eead4;margin:0 0 12px">Password reset</h2>
      <p style="color:#94a3b8;line-height:1.5">${body}</p>
      <p style="margin:20px 0 0"><a href="${login}" style="display:inline-block;background:#14b8a6;color:#0f172a;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Log in</a></p>
      <p style="color:#475569;font-size:12px;margin-top:24px">${escapeHtml(env.appName)} · ${escapeHtml(login)}</p>
    </div>`,
  });
}

async function sendAppliedJobsDigest({ to, applied, followUps, approveNow, summary, profile }) {
  const name = profile?.displayName || 'there';
  const appliedRows =
    applied.length > 0
      ? applied
          .map(
            (j) =>
              `<tr><td style="padding:8px;border-bottom:1px solid #334155">${escapeHtml(j.title)}</td>` +
              `<td style="padding:8px;border-bottom:1px solid #334155">${escapeHtml(j.company || '')}</td>` +
              `<td style="padding:8px;border-bottom:1px solid #334155">${j.matchPct}% / ${j.interviewLikelihoodPct}%</td>` +
              `<td style="padding:8px;border-bottom:1px solid #334155">${escapeHtml(j.source || '')}</td></tr>`
          )
          .join('')
      : `<tr><td colspan="4" style="padding:12px;color:#94a3b8">No submitted applications yet.</td></tr>`;

  const followBlock =
    followUps.length > 0
      ? `<h3 style="color:#5eead4;margin:24px 0 8px">Follow-ups due</h3><ul style="color:#94a3b8;line-height:1.6">${followUps
          .map((f) => `<li><strong>${escapeHtml(f.title)}</strong> at ${escapeHtml(f.company)} — ${escapeHtml(f.reason)}</li>`)
          .join('')}</ul>`
      : '';

  const approveBlock =
    approveNow.length > 0
      ? `<h3 style="color:#5eead4;margin:24px 0 8px">High-likelihood jobs to approve</h3><ul style="color:#94a3b8;line-height:1.6">${approveNow
          .map(
            (j) =>
              `<li><strong>${escapeHtml(j.title)}</strong> at ${escapeHtml(j.company)} — ${j.interviewLikelihoodPct}% interview likelihood</li>`
          )
          .join('')}</ul>`
      : '';

  const html = `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;color:#e2e8f0;background:#0f172a;padding:24px;border-radius:12px">
    <h2 style="color:#5eead4;margin:0 0 8px">Your ${escapeHtml(env.appName)} application digest</h2>
    <p style="color:#94a3b8">Hi ${escapeHtml(name)}, here are your best-fit submitted applications and what to do next.</p>
    <h3 style="color:#5eead4;margin:24px 0 8px">Applications submitted</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr style="color:#64748b;text-align:left">
        <th style="padding:8px">Role</th><th style="padding:8px">Company</th><th style="padding:8px">Match / Likelihood</th><th style="padding:8px">Source</th>
      </tr></thead>
      <tbody>${appliedRows}</tbody>
    </table>
    ${followBlock}
    ${approveBlock}
    <p style="margin:24px 0 0"><a href="${env.appUrl.replace(/\/$/, '')}/follow-ups" style="display:inline-block;background:#14b8a6;color:#0f172a;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Open traction trace →</a></p>
    <p style="color:#475569;font-size:12px;margin-top:24px">${escapeHtml(env.appName)} · Match % = skill fit · Likelihood % = estimated reply chance</p>
  </div>`;

  return sendEmail({
    to,
    subject: `${env.appName}: ${applied.length} applied job(s) · ${summary.followUpsDue || 0} follow-up(s) due`,
    html,
  });
}

async function sendFollowUpReminder({ to, item }) {
  return sendEmail({
    to,
    subject: `Follow up: ${item.title} at ${item.company}`,
    html: wrapHtml(
      'Application follow-up reminder',
      `<strong>${escapeHtml(item.title)}</strong> at ${escapeHtml(item.company)}<br><br>` +
        `${escapeHtml(item.reason)}<br><br>` +
        `<em>${escapeHtml(item.suggestedAction)}</em>`,
      '/follow-ups'
    ),
  });
}

function followUpSnippet(company, title) {
  const co = company || 'the team';
  const role = title || 'the role';
  return `Hi — I applied for ${role} at ${co} recently and wanted to confirm my application was received. I'm very interested in the role and happy to share more on my background. Thank you for your time.`;
}

function applyStatusMeta(job, { queued, preparedOnly }) {
  if (preparedOnly) {
    return { label: 'Ready to submit', bg: '#422006', fg: '#fcd34d', border: '#854d0e' };
  }
  if (queued || job.status === 'queued') {
    return { label: 'Queued — finish the form', bg: '#0c4a6e', fg: '#7dd3fc', border: '#0369a1' };
  }
  return { label: 'Submitted', bg: '#064e3b', fg: '#6ee7b7', border: '#047857' };
}

function tractionMeter(label, value, color) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  return `
    <div style="margin-top:10px">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-bottom:4px">
        <span>${escapeHtml(label)}</span>
        <span style="color:#e2e8f0;font-weight:600">${pct}%</span>
      </div>
      <div style="background:#334155;border-radius:999px;height:7px;overflow:hidden">
        <div style="width:${pct}%;background:${color};height:7px;border-radius:999px"></div>
      </div>
    </div>`;
}

function renderApplyJobCard(job, index, total, { queued, preparedOnly }) {
  const status = applyStatusMeta(job, { queued, preparedOnly });
  const url = job.url || job.applyUrl || job.jobUrl || '';
  const snippet = followUpSnippet(job.company, job.title);
  const source = job.source ? `<span style="color:#64748b">via ${escapeHtml(job.source)}</span>` : '';

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;border-collapse:separate;border-spacing:0">
      <tr>
        <td style="background:#111827;border:1px solid #1f2937;border-radius:14px;padding:18px 20px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="vertical-align:top">
                <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b">
                  Application ${index + 1} of ${total}
                </div>
                <div style="margin-top:8px;font-size:20px;line-height:1.25;font-weight:700;color:#f8fafc">${escapeHtml(job.title || 'Role')}</div>
                <div style="margin-top:4px;font-size:16px;font-weight:600;color:#5eead4">${escapeHtml(job.company || 'Company')}</div>
                ${source ? `<div style="margin-top:6px;font-size:12px">${source}</div>` : ''}
              </td>
              <td style="vertical-align:top;text-align:right;width:120px">
                <span style="display:inline-block;padding:6px 10px;border-radius:999px;background:${status.bg};border:1px solid ${status.border};color:${status.fg};font-size:11px;font-weight:700;white-space:nowrap">
                  ${escapeHtml(status.label)}
                </span>
              </td>
            </tr>
          </table>
          ${
            job.matchPct != null || job.interviewLikelihoodPct != null
              ? `<div style="margin-top:14px;padding-top:14px;border-top:1px solid #1f2937">
                  ${job.matchPct != null ? tractionMeter('Skill match', job.matchPct, '#14b8a6') : ''}
                  ${job.interviewLikelihoodPct != null ? tractionMeter('Interview likelihood', job.interviewLikelihoodPct, '#38bdf8') : ''}
                </div>`
              : ''
          }
          ${
            url
              ? `<p style="margin:14px 0 0"><a href="${escapeHtml(url)}" style="color:#2dd4bf;text-decoration:none;font-size:13px;font-weight:600">View job posting →</a></p>`
              : ''
          }
          <div style="margin-top:14px;padding:12px 14px;border-radius:10px;background:#0f172a;border:1px solid #334155">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin-bottom:6px">Suggested follow-up</div>
            <div style="font-size:12px;line-height:1.55;color:#cbd5e1;font-style:italic">${escapeHtml(snippet)}</div>
          </div>
        </td>
      </tr>
    </table>`;
}

async function sendPostApplyBatchEmail({
  to,
  jobs = [],
  profile,
  companies = [],
  useTailoredResume,
  queued = false,
  preparedOnly = false,
}) {
  const name = profile?.applicantName || profile?.displayName || 'there';
  const count = jobs.length;
  const companyCount = companies.length || new Set(jobs.map((j) => (j.company || '').trim()).filter(Boolean)).size;
  const appUrl = env.appUrl.replace(/\/$/, '');

  const headline = preparedOnly
    ? `${count} application${count === 1 ? '' : 's'} prepared`
    : queued
      ? `${count} application${count === 1 ? '' : 's'} queued`
      : `${count} application${count === 1 ? '' : 's'} submitted`;

  const intro = preparedOnly
    ? 'Your applications are ready. Review each role below, submit the forms, then use the follow-up notes when you reach out.'
    : queued
      ? `Finish each form in Chrome with the ${env.appName} extension, then track traction below.`
      : 'Here is your traction summary — what you applied for, where, and suggested next steps for each role.';

  const jobCards =
    jobs.length > 0
      ? jobs.map((j, i) => renderApplyJobCard(j, i, count, { queued, preparedOnly })).join('')
      : `<p style="color:#94a3b8;padding:12px 0">No jobs in this batch.</p>`;

  const summaryLine =
    count === 1 && jobs[0]
      ? `${jobs[0].title} at ${jobs[0].company}`
      : `${count} roles across ${companyCount || count} compan${companyCount === 1 ? 'y' : 'ies'}`;

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#020617">
  <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto;color:#e2e8f0;background:#0f172a;padding:0 0 28px">
    <div style="background:linear-gradient(135deg,#042f2e 0%,#0f172a 55%,#111827 100%);padding:28px 24px 22px;border-bottom:1px solid #134e4a">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#5eead4">${escapeHtml(env.appName)} traction</div>
      <h1 style="margin:10px 0 0;font-size:26px;line-height:1.2;color:#f8fafc">${escapeHtml(headline)}</h1>
      <p style="margin:10px 0 0;font-size:15px;color:#94a3b8">Hi ${escapeHtml(name)} — ${escapeHtml(summaryLine)}</p>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#94a3b8">
        ${escapeHtml(intro)}
        ${useTailoredResume ? ' Tailored resumes were prepared for these roles.' : ''}
      </p>
      <h2 style="margin:0 0 14px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#5eead4">Your applications</h2>
      ${jobCards}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
        <tr>
          <td style="padding:18px 0 8px">
            <a href="${appUrl}/applications" style="display:inline-block;background:#14b8a6;color:#042f2e;text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:700;font-size:14px;margin-right:8px">View applications →</a>
            <a href="${appUrl}/follow-ups" style="display:inline-block;border:1px solid #334155;color:#e2e8f0;text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:600;font-size:14px">Open traction trace →</a>
          </td>
        </tr>
      </table>
      <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#64748b">
        <strong style="color:#94a3b8">Tip:</strong> set a reminder for 3–5 business days, then send a short follow-up to the recruiter or hiring manager.
      </p>
    </div>
    <div style="padding:0 24px">
      <p style="margin:0;font-size:11px;line-height:1.5;color:#475569;border-top:1px solid #1e293b;padding-top:16px">
        ${escapeHtml(env.appName)} · Sent to ${escapeHtml(to)} · Applications submitted as ${escapeHtml(profile?.digestEmail || to)} ·
        From ${escapeHtml(env.emailFrom)}
      </p>
    </div>
  </div>
</body>
</html>`;

  const subjectRole = jobs[0]?.title && jobs[0]?.company ? `${jobs[0].title} at ${jobs[0].company}` : summaryLine;
  const subjectExtra = count > 1 ? ` (+${count - 1} more)` : '';

  return sendEmail({
    to,
    subject: `${env.appName}: ${preparedOnly ? 'Prepared' : queued ? 'Queued' : 'Applied'} — ${subjectRole}${subjectExtra}`,
    html,
  });
}

async function notifyForgotPassword({ to, name, resetUrl }) {
  const login = loginUrl();
  return sendEmail({
    to,
    subject: `Reset your ${env.appName} password`,
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#e2e8f0;background:#0f172a;padding:24px;border-radius:12px">
      <h2 style="color:#5eead4;margin:0 0 12px">Reset your password</h2>
      <p style="color:#94a3b8;line-height:1.5">Hi ${escapeHtml(name || 'there')}, we received a request to reset your ${escapeHtml(env.appName)} password. This link expires in 1 hour.</p>
      <p style="margin:20px 0 0"><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#14b8a6;color:#0f172a;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Choose a new password</a></p>
      <p style="color:#64748b;font-size:13px;margin-top:16px">If you did not request this, you can ignore this email.</p>
      <p style="color:#475569;font-size:12px;margin-top:24px">${escapeHtml(env.appName)} · ${escapeHtml(login)}</p>
    </div>`,
  });
}

module.exports = {
  sendEmail,
  sendTestEmail,
  sendToUser,
  getEmailDiagnostics,
  getResendDomainStatus,
  isEmailConfigured,
  notifyHighMatch,
  notifyChatInvite,
  notifyInterviewReminder,
  notifyTeamInvite,
  notifyPasswordReset,
  notifyForgotPassword,
  sendAppliedJobsDigest,
  sendFollowUpReminder,
  sendPostApplyBatchEmail,
  wrapHtml,
};
