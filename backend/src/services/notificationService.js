const Notification = require('../models/Notification');
const env = require('../config/env');
const jobService = require('./jobService');
const profileService = require('./profileService');
const ChatRequest = require('../models/ChatRequest');
const Watchlist = require('../models/Watchlist');
const emailService = require('./emailService');
const { scoreJobsForProfile } = require('./jobScoringService');
const User = require('../models/User');
const localNotificationStore = require('./localNotificationStore');
const tractionService = require('./tractionService');
const pushService = require('./pushService');

function requireMongo() {
  if (!env.mongoUri) throw new Error('MongoDB is required');
}

let emitToUser = () => {};

function setEmitter(fn) {
  emitToUser = fn;
}

async function hasRecentFollowUp(userId, jobId, withinMs = 14 * 86400000) {
  if (!jobId) return false;
  if (!env.mongoUri) {
    return localNotificationStore
      .list(userId)
      .some(
        (n) =>
          n.type === 'follow_up' &&
          String(n.meta?.jobId) === String(jobId) &&
          new Date(n.createdAt) > new Date(Date.now() - withinMs)
      );
  }
  requireMongo();
  const found = await Notification.findOne({
    userId,
    type: 'follow_up',
    'meta.jobId': String(jobId),
    createdAt: { $gte: new Date(Date.now() - withinMs) },
  })
    .select('_id')
    .lean();
  return Boolean(found);
}

async function create(userId, payload, options = {}) {
  if (!env.mongoUri) {
    const n = localNotificationStore.create(userId, payload);
    emitToUser(userId.toString(), 'notification', n);
    return n;
  }
  requireMongo();
  const n = await Notification.create({ userId, ...payload });
  emitToUser(userId.toString(), 'notification', n);

  try {
    if (!options.skipEmail && payload.type === 'high_match' && payload.meta?.jobId) {
      const parts = payload.title?.match(/(\d+)% match: (.+)/);
      await emailService.notifyHighMatch(userId, {
        matchPct: parts?.[1] || '',
        title: parts?.[2] || payload.title,
        company: payload.body?.split(' — ')[0] || '',
      });
    }
    if (!options.skipEmail && payload.type === 'chat_request') {
      await emailService.sendToUser(
        userId,
        payload.title,
        emailService.wrapHtml?.('Chat invite', payload.body, '/chat') ||
          `<p>${payload.body}</p>`
      );
    }
  } catch {
    /* email optional */
  }

  if (!options.skipPush) {
    try {
      await pushService.sendToUser(userId, {
        title: payload.title || env.appName,
        body: payload.body || '',
        url: payload.link || '/',
      });
    } catch {
      /* push optional */
    }
  }

  return n;
}

async function list(userId, unreadOnly = false) {
  if (!env.mongoUri) {
    return localNotificationStore.list(userId, unreadOnly);
  }
  requireMongo();
  const q = { userId };
  if (unreadOnly) q.read = false;
  return Notification.find(q).sort({ createdAt: -1 }).limit(50).lean();
}

async function markRead(userId, id) {
  if (!env.mongoUri) {
    localNotificationStore.markRead(userId, id);
    return;
  }
  requireMongo();
  await Notification.findOneAndUpdate({ _id: id, userId }, { read: true });
}

async function markAllRead(userId) {
  if (!env.mongoUri) {
    localNotificationStore.markAllRead(userId);
    return;
  }
  requireMongo();
  await Notification.updateMany({ userId, read: false }, { read: true });
}

async function unreadCount(userId) {
  if (!env.mongoUri) {
    return localNotificationStore.unreadCount(userId);
  }
  requireMongo();
  return Notification.countDocuments({ userId, read: false });
}

async function scanAndNotify(userId) {
  if (!env.mongoUri) {
    await tractionService.scanAndNotifyTraction(userId);
    const profile = await profileService.getOrCreate(userId);
    const minHigh = Math.max(profile.minMatchScore || 60, 85);
    const jobs = scoreJobsForProfile(jobService.readJobsFromSqlite(200), profile, userId).filter(
      (j) => j.personalMatchPct >= minHigh
    );
    for (const job of jobs.slice(0, 2)) {
      const exists = localNotificationStore
        .list(userId)
        .find(
          (n) =>
            n.type === 'high_match' &&
            n.meta?.jobId === job.jobId &&
            new Date(n.createdAt) > new Date(Date.now() - 7 * 86400000)
        );
      if (!exists) {
        await create(userId, {
          type: 'high_match',
          title: `${job.personalMatchPct}% match: ${job.title}`,
          body: `${job.company} — ${job.interviewLikelihoodPct || 0}% interview likelihood`,
          link: '/approvals',
          meta: { jobId: job.jobId },
        });
      }
    }
    return;
  }
  requireMongo();
  const profile = await profileService.getOrCreate(userId);
  const minHigh = Math.max(profile.minMatchScore || 60, 85);
  const jobs = scoreJobsForProfile(jobService.readJobsFromSqlite(200), profile).filter(
    (j) => j.personalMatchPct >= minHigh
  );
  for (const job of jobs.slice(0, 3)) {
    const exists = await Notification.findOne({
      userId,
      type: 'high_match',
      'meta.jobId': job.jobId,
      createdAt: { $gte: new Date(Date.now() - 7 * 86400000) },
    });
    if (!exists) {
      await create(userId, {
        type: 'high_match',
        title: `${job.personalMatchPct}% match: ${job.title}`,
        body: `${job.company} — review in Apply Queue`,
        link: '/approvals',
        meta: { jobId: job.jobId },
      });
    }
  }

  const pending = await ChatRequest.countDocuments({ toUserId: userId, status: 'pending' });
  if (pending > 0) {
    const exists = await Notification.findOne({
      userId,
      type: 'chat_request',
      read: false,
      createdAt: { $gte: new Date(Date.now() - 86400000) },
    });
    if (!exists) {
      await create(userId, {
        type: 'chat_request',
        title: `${pending} chat invite${pending > 1 ? 's' : ''} pending`,
        body: 'Accept to start messaging',
        link: '/chat',
      });
    }
  }

  try {
    const counts = await require('./approvalService').counts(userId);
    if (counts.pending >= 5) {
      const exists = await Notification.findOne({
        userId,
        type: 'approval_queue',
        read: false,
        createdAt: { $gte: new Date(Date.now() - 86400000) },
      });
      if (!exists) {
        await create(userId, {
          type: 'approval_queue',
          title: `${counts.pending} jobs awaiting approval`,
          body: 'Your apply queue is filling up',
          link: '/approvals',
        });
      }
    }
  } catch {
    /* approvals may fail without mongo jobs */
  }

  const watchlists = await Watchlist.find({ userId, alertOnNewJobs: true });
  for (const w of watchlists) {
    const newJobs = jobService.readJobsFromSqlite(500).filter(
      (j) =>
        j.company?.toLowerCase().includes(w.company.toLowerCase()) &&
        j.firstSeen &&
        new Date(j.firstSeen) > new Date(Date.now() - 7 * 86400000)
    );
    if (newJobs.length) {
      await create(userId, {
        type: 'watchlist',
        title: `New ${w.company} roles`,
        body: `${newJobs.length} new listing(s)`,
        link: '/jobs',
        meta: { company: w.company },
      });
    }
  }
}

async function notifyApplyBatch(userId, { jobs = [], companies = [], queued = false, emailSent = false, emailTo = '' } = {}) {
  const count = (jobs || []).length;
  if (!count) return null;
  const names = (companies || []).filter(Boolean).slice(0, 3);
  const companyText = names.length ? names.join(', ') : `${count} role(s)`;
  const suffix = (companies || []).length > 3 ? ` +${companies.length - 3} more` : '';
  const emailNote = emailSent
    ? `Summary also emailed to ${emailTo || 'your inbox'}.`
    : 'Open Follow-ups for details — email could not be sent.';
  return create(userId, {
    type: 'apply_batch',
    title: queued ? `${count} role(s) queued for apply` : `Applied to ${count} role(s)`,
    body: `${companyText}${suffix}. ${emailNote}`,
    link: '/follow-ups',
    meta: {
      jobIds: jobs.map((j) => j.jobId).filter(Boolean),
      count,
      companies: companies || [],
      emailSent,
    },
  });
}

module.exports = { create, hasRecentFollowUp, list, markRead, markAllRead, unreadCount, scanAndNotify, notifyApplyBatch, setEmitter };
