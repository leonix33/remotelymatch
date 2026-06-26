const profileService = require('./profileService');
const jobService = require('./jobService');
const applicationService = require('./applicationService');
const approvalService = require('./approvalService');
const localOutcomeStore = require('./localOutcomeStore');
const localFollowUpStore = require('./localFollowUpStore');
const localNotificationStore = require('./localNotificationStore');
const emailService = require('./emailService');
const { scoreJobsForProfile } = require('./jobScoringService');
const env = require('../config/env');

const POSITIVE_STAGES = new Set(['screen', 'onsite', 'offer']);

function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function resolveDigestEmail(profile) {
  return (
    profile?.digestEmail?.trim() ||
    profile?.notificationEmail?.trim() ||
    env.adminEmail ||
    ''
  );
}

function followUpUrgency(days) {
  if (days == null) return { urgency: 'low', status: 'unknown', score: 20 };
  if (days >= 3 && days <= 7) return { urgency: 'high', status: 'due', score: 90 };
  if (days >= 8 && days <= 14) return { urgency: 'medium', status: 'due', score: 70 };
  if (days >= 1 && days <= 2) return { urgency: 'low', status: 'waiting', score: 30 };
  if (days > 14) return { urgency: 'low', status: 'stale', score: 40 };
  return { urgency: 'low', status: 'waiting', score: 15 };
}

async function buildTractionTrace(userId) {
  const profile = await profileService.getOrCreate(userId);
  const applications = await applicationService.listForUser(userId, { limit: 500 });
  const outcomes = localOutcomeStore.list(userId);
  const outcomeByJob = new Map(outcomes.map((o) => [o.jobId, o]));

  const allJobs = scoreJobsForProfile(jobService.readJobsFromSqlite(5000), profile, userId);
  const jobById = new Map(allJobs.map((j) => [j.jobId, j]));

  const trace = [];

  for (const app of applications) {
    if (localFollowUpStore.isCompleted(userId, app.jobId)) continue;

    const outcome = outcomeByJob.get(app.jobId);
    if (outcome && POSITIVE_STAGES.has(outcome.stage)) continue;
    if (outcome?.stage === 'rejected' || outcome?.stage === 'withdrawn') continue;

    const job = jobById.get(app.jobId) || {};
    const appliedAt = app.submittedAt || app.lastAttempted;
    const days = daysSince(appliedAt);
    const { urgency, status, score: dayScore } = followUpUrgency(days);

    if (app.status === 'submitted' && days != null && days >= 3) {
      trace.push({
        id: `fu-${app.jobId}`,
        type: 'follow_up',
        jobId: app.jobId,
        title: app.title,
        company: app.company || job.company || 'Unknown',
        url: app.applyUrl || app.jobUrl || job.url,
        source: app.source || job.source,
        matchPct: job.personalMatchPct ?? job.matchPct ?? 0,
        interviewLikelihoodPct: job.interviewLikelihoodPct ?? 0,
        tractionScore: Math.min(
          100,
          Math.round(dayScore * 0.5 + (job.interviewLikelihoodPct || 0) * 0.35 + (job.personalMatchPct || 0) * 0.15)
        ),
        urgency,
        followUpStatus: status,
        daysSinceApply: days,
        appliedAt,
        applicationStatus: app.status,
        reason: `Applied ${days} day(s) ago — no reply logged yet`,
        suggestedAction: 'Send a polite LinkedIn message or email to recruiter/hiring manager',
        link: '/follow-ups',
      });
    } else if (['manual-review', 'filled-only', 'external-apply', 'email-apply'].includes(app.status)) {
      trace.push({
        id: `manual-${app.jobId}`,
        type: 'manual_action',
        jobId: app.jobId,
        title: app.title,
        company: app.company || job.company || 'Unknown',
        url: app.applyUrl || app.jobUrl || job.url,
        source: app.source || job.source,
        matchPct: job.personalMatchPct ?? job.matchPct ?? 0,
        interviewLikelihoodPct: job.interviewLikelihoodPct ?? 0,
        tractionScore: Math.min(100, 55 + (job.interviewLikelihoodPct || 0) * 0.3),
        urgency: 'high',
        followUpStatus: 'due',
        daysSinceApply: days,
        appliedAt,
        applicationStatus: app.status,
        reason: `Application needs manual completion (${app.status})`,
        suggestedAction: 'Finish the application or queue with the Chrome extension',
        link: '/applications',
      });
    }
  }

  const queue = await approvalService.listForUser(userId, { status: 'pending', limit: 0 });
  const items = queue.items || [];
  for (const job of items) {
    const likelihood = job.interviewLikelihoodPct || 0;
    const match = job.personalMatchPct ?? job.matchPct ?? 0;
    if (likelihood >= 28 || match >= 80) {
      trace.push({
        id: `approve-${job.jobId}`,
        type: 'approve_now',
        jobId: job.jobId,
        title: job.title,
        company: job.company,
        url: job.url,
        source: job.source,
        matchPct: match,
        interviewLikelihoodPct: likelihood,
        tractionScore: Math.min(100, Math.round(likelihood * 0.6 + match * 0.35)),
        urgency: likelihood >= 35 ? 'high' : 'medium',
        followUpStatus: 'pending_approval',
        reason: `${likelihood}% interview likelihood — approve before the role fills`,
        suggestedAction: 'Review application kit, approve, then apply',
        link: '/approvals',
      });
    }
  }

  const approved = await approvalService.listForUser(userId, { status: 'approved', limit: 0 });
  const submittedIds = new Set(applications.filter((a) => a.status === 'submitted').map((a) => a.jobId));
  for (const job of approved.items || []) {
    if (submittedIds.has(job.jobId)) continue;
    trace.push({
      id: `apply-${job.jobId}`,
      type: 'apply_now',
      jobId: job.jobId,
      title: job.title,
      company: job.company,
      url: job.url,
      source: job.source,
      matchPct: job.personalMatchPct ?? job.matchPct ?? 0,
      interviewLikelihoodPct: job.interviewLikelihoodPct ?? 0,
      tractionScore: Math.min(100, Math.round((job.interviewLikelihoodPct || 0) * 0.7 + (job.personalMatchPct || 0) * 0.2)),
      urgency: 'medium',
      followUpStatus: 'approved_not_applied',
      reason: 'Approved but not yet submitted by agent',
      suggestedAction: 'Click Apply approved on the apply queue',
      link: '/approvals',
    });
  }

  trace.sort((a, b) => b.tractionScore - a.tractionScore);
  return {
    trace,
    summary: {
      total: trace.length,
      high: trace.filter((t) => t.urgency === 'high').length,
      followUpsDue: trace.filter((t) => t.type === 'follow_up').length,
      approveNow: trace.filter((t) => t.type === 'approve_now').length,
    },
  };
}

async function buildAppliedJobsDigest(userId, profile) {
  const applications = await applicationService.listForUser(userId, { limit: 200 });
  const allJobs = scoreJobsForProfile(jobService.readJobsFromSqlite(5000), profile, userId);
  const jobById = new Map(allJobs.map((j) => [j.jobId, j]));

  const submitted = applications
    .filter((a) => ['submitted', 'queued'].includes(a.status) || a.submittedAt)
    .map((app) => {
      const job = jobById.get(app.jobId) || {};
      return {
        jobId: app.jobId,
        title: app.title,
        company: app.company || job.company,
        source: app.source || job.source,
        url: app.applyUrl || app.jobUrl || job.url,
        submittedAt: app.submittedAt || app.lastAttempted,
        matchPct: job.personalMatchPct ?? job.matchPct ?? 0,
        interviewLikelihoodPct: job.interviewLikelihoodPct ?? 0,
      };
    })
    .sort(
      (a, b) =>
        (b.interviewLikelihoodPct || 0) - (a.interviewLikelihoodPct || 0) ||
        (b.matchPct || 0) - (a.matchPct || 0)
    );

  return submitted.slice(0, 25);
}

async function sendAppliedDigestEmail(userId) {
  const profile = await profileService.getOrCreate(userId);
  if (profile.emailDigestEnabled === false) {
    return { sent: false, reason: 'Email digest disabled in Profile' };
  }
  const to = resolveDigestEmail(profile);
  if (!to) return { sent: false, reason: 'No digest email configured' };

  const applied = await buildAppliedJobsDigest(userId, profile);
  const { trace, summary } = await buildTractionTrace(userId);
  const followUps = trace.filter((t) => t.type === 'follow_up').slice(0, 8);
  const approveNow = trace.filter((t) => t.type === 'approve_now').slice(0, 5);

  return emailService.sendAppliedJobsDigest({
    to,
    applied,
    followUps,
    approveNow,
    summary,
    profile,
  }).then((result) => ({ sent: true, to, result }));
}

async function scanAndNotifyTraction(userId) {
  const profile = await profileService.getOrCreate(userId);
  if (profile.followUpRemindersEnabled === false) {
    return { created: 0, reason: 'Follow-up reminders disabled' };
  }

  const { trace } = await buildTractionTrace(userId);
  let created = 0;
  const highItems = trace.filter((t) => t.urgency === 'high').slice(0, 5);

  for (const item of highItems) {
    const exists = localNotificationStore
      .list(userId)
      .find(
        (n) =>
          n.type === 'follow_up' &&
          n.meta?.jobId === item.jobId &&
          new Date(n.createdAt) > new Date(Date.now() - 2 * 86400000)
      );
    if (exists) continue;

    const notification = localNotificationStore.create(userId, {
      type: 'follow_up',
      title: item.type === 'follow_up' ? `Follow up: ${item.title}` : item.reason,
      body: `${item.company} · ${item.suggestedAction}`,
      link: '/follow-ups',
      meta: { jobId: item.jobId, tractionScore: item.tractionScore },
    });
    created += 1;

    if (profile.emailDigestEnabled !== false && item.type === 'follow_up' && item.urgency === 'high') {
      try {
        const to = resolveDigestEmail(profile);
        if (to && env.resendApiKey) {
          await emailService.sendFollowUpReminder({ to, item });
        }
      } catch {
        /* optional */
      }
    }
  }

  return { created, notifications: highItems.length };
}

async function markFollowUpDone(userId, jobId, notes = '') {
  localFollowUpStore.markCompleted(userId, jobId, notes);
  return { jobId, completed: true };
}

async function sendPostApplyFeedback(userId, jobs = [], options = {}) {
  const profile = await profileService.getOrCreate(userId);
  if (profile.emailDigestEnabled === false) {
    return { sent: false, reason: 'Email digest disabled in Profile' };
  }
  const to = resolveDigestEmail(profile);
  if (!to) return { sent: false, reason: 'No digest email configured in Profile' };
  if (!env.resendApiKey) return { sent: false, reason: 'Resend not configured (add RESEND_API_KEY on Render)' };

  const list = (jobs || []).map((j) => ({
    title: j.title,
    company: j.company,
    url: j.url || j.applyUrl,
    matchPct: j.personalMatchPct ?? j.matchPct ?? null,
  }));

  const result = await emailService.sendPostApplyBatchEmail({
    to,
    jobs: list,
    profile,
    useTailoredResume: Boolean(options.useTailoredResume),
    queued: Boolean(options.queued),
  });
  return { ...result, to };
}

async function previewDigest(userId) {
  const profile = await profileService.getOrCreate(userId);
  const applied = await buildAppliedJobsDigest(userId, profile);
  const { trace, summary } = await buildTractionTrace(userId);
  return {
    digestEmail: resolveDigestEmail(profile),
    emailDigestEnabled: profile.emailDigestEnabled !== false,
    applied,
    followUps: trace.filter((t) => t.type === 'follow_up'),
    approveNow: trace.filter((t) => t.type === 'approve_now'),
    summary,
  };
}

module.exports = {
  buildTractionTrace,
  buildAppliedJobsDigest,
  sendAppliedDigestEmail,
  sendPostApplyFeedback,
  scanAndNotifyTraction,
  markFollowUpDone,
  previewDigest,
  resolveDigestEmail,
  followUpUrgency,
};
