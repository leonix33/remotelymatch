const env = require('../config/env');
const User = require('../models/User');

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

async function sendEmail({ to, subject, html }) {
  if (!env.resendApiKey || !to) return { sent: false, reason: 'email not configured' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    let reason = err;
    try {
      const parsed = JSON.parse(err);
      reason = parsed.message || parsed.error || err;
    } catch {
      // keep raw text
    }
    return { sent: false, reason };
  }
  return { sent: true };
}

async function sendToUser(userId, subject, html) {
  if (!env.mongoUri) return { sent: false };
  const user = await User.findById(userId).select('email name');
  if (!user?.email) return { sent: false };
  return sendEmail({ to: user.email, subject, html });
}

function wrapHtml(title, body, link) {
  const appUrl = env.appUrl;
  const cta = link ? `<p><a href="${appUrl}${link}" style="color:#2dd4bf">Open in RemoteMatch →</a></p>` : '';
  return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#e2e8f0;background:#0f172a;padding:24px;border-radius:12px">
    <h2 style="color:#5eead4;margin:0 0 12px">${title}</h2>
    <p style="color:#94a3b8;line-height:1.5">${body}</p>
    ${cta}
    <p style="color:#475569;font-size:12px;margin-top:24px">RemoteMatch · ${appUrl}</p>
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
    `${fromName} wants to chat on RemoteMatch`,
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
    <h2 style="color:#5eead4;margin:0 0 8px">Your RemoteMatch application digest</h2>
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

async function sendPostApplyBatchEmail({ to, jobs = [], profile, useTailoredResume, queued = false }) {
  const name = profile?.applicantName || profile?.displayName || 'there';
  const count = jobs.length;
  const headline = queued
    ? `${count} application${count === 1 ? '' : 's'} queued — finish forms, then follow up`
    : `${count} application${count === 1 ? '' : 's'} submitted — here's your follow-up plan`;

  const rows =
    jobs.length > 0
      ? jobs
          .map((j) => {
            const url = j.url || j.applyUrl || j.jobUrl || '';
            const link = url
              ? `<a href="${escapeHtml(url)}" style="color:#2dd4bf;text-decoration:none">View posting</a>`
              : '';
            const snippet = followUpSnippet(j.company, j.title);
            return `<tr>
              <td style="padding:12px 8px;border-bottom:1px solid #334155;vertical-align:top">
                <strong style="color:#e2e8f0">${escapeHtml(j.title || 'Role')}</strong><br>
                <span style="color:#94a3b8">${escapeHtml(j.company || 'Company')}</span>
              </td>
              <td style="padding:12px 8px;border-bottom:1px solid #334155;vertical-align:top;color:#94a3b8;font-size:13px">
                ${j.matchPct != null ? `${j.matchPct}% match` : ''}
                ${link ? `<br>${link}` : ''}
              </td>
              <td style="padding:12px 8px;border-bottom:1px solid #334155;vertical-align:top;color:#cbd5e1;font-size:12px;line-height:1.5">
                <em>${escapeHtml(snippet)}</em>
              </td>
            </tr>`;
          })
          .join('')
      : `<tr><td colspan="3" style="padding:12px;color:#94a3b8">No jobs in this batch.</td></tr>`;

  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:0 auto;color:#e2e8f0;background:#0f172a;padding:28px;border-radius:12px">
    <h2 style="color:#5eead4;margin:0 0 8px;font-size:22px">${escapeHtml(headline)}</h2>
    <p style="color:#94a3b8;line-height:1.6;margin:0">
      Hi ${escapeHtml(name)}, your RemoteMatch batch is complete.
      ${useTailoredResume ? ' Tailored resumes were prepared for each role.' : ''}
      ${queued ? ' Open each posting in Chrome and submit with the RemoteMatch extension, then use the follow-up notes below.' : ' Consider a short follow-up in 3–5 business days if you have not heard back.'}
    </p>
    <h3 style="color:#5eead4;margin:28px 0 12px;font-size:16px">Companies to follow up with</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr style="color:#64748b;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.04em">
          <th style="padding:8px">Role</th>
          <th style="padding:8px">Details</th>
          <th style="padding:8px">Suggested message</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:28px 0 0;color:#94a3b8;font-size:14px;line-height:1.6">
      <strong style="color:#e2e8f0">Next steps:</strong> bookmark these companies, set a calendar reminder for 3–5 days out,
      and send a polite note to the recruiter or hiring manager on LinkedIn or email.
    </p>
    <p style="margin:20px 0 0">
      <a href="${env.appUrl.replace(/\/$/, '')}/follow-ups" style="display:inline-block;background:#14b8a6;color:#0f172a;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Open follow-up tracker →</a>
      &nbsp;
      <a href="${env.appUrl.replace(/\/$/, '')}/tailored-resumes" style="display:inline-block;border:1px solid #334155;color:#e2e8f0;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:500">Review tailored resumes →</a>
    </p>
    <p style="color:#475569;font-size:12px;margin-top:28px;line-height:1.5">
      ${escapeHtml(env.appName)} · Applications use your personal email (${escapeHtml(profile?.digestEmail || 'set in Profile')}) ·
      This message was sent from ${escapeHtml(env.emailFrom)}
    </p>
  </div>`;

  return sendEmail({
    to,
    subject: `${env.appName}: ${headline}`,
    html,
  });
}

module.exports = {
  sendEmail,
  sendToUser,
  notifyHighMatch,
  notifyChatInvite,
  notifyInterviewReminder,
  notifyTeamInvite,
  notifyPasswordReset,
  sendAppliedJobsDigest,
  sendFollowUpReminder,
  sendPostApplyBatchEmail,
  wrapHtml,
};
