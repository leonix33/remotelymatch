const Application = require('../models/Application');
const env = require('../config/env');
const localApplicationService = require('./localApplicationService');

function normalizeApp(doc) {
  if (!doc) return null;
  const row = doc.toObject ? doc.toObject() : { ...doc };
  return {
    ...row,
    jobId: row.jobId,
    userId: row.userId?.toString?.() || row.userId,
  };
}

async function listForUser(userId, { status, limit = 500, offset = 0 } = {}) {
  if (!userId) return [];

  if (env.mongoUri) {
    const q = { userId };
    if (status) q.status = status;
    const apps = await Application.find(q)
      .sort({ lastAttempted: -1, updatedAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit))
      .lean();
    return apps.map(normalizeApp);
  }

  let apps = localApplicationService.listForUser(userId);
  if (status) apps = apps.filter((a) => a.status === status);
  apps.sort((a, b) => new Date(b.lastAttempted || b.updatedAt || 0) - new Date(a.lastAttempted || a.updatedAt || 0));
  return apps.slice(Number(offset), Number(offset) + Number(limit));
}

async function getForUserAndJob(userId, jobId) {
  if (!userId || !jobId) return null;
  if (env.mongoUri) {
    const app = await Application.findOne({ userId, jobId }).lean();
    return normalizeApp(app);
  }
  return localApplicationService.get(userId, jobId);
}

async function upsertForUser(userId, jobId, data = {}) {
  if (!userId || !jobId) return null;
  const now = new Date();
  const payload = {
    userId,
    jobId,
    title: data.title || 'Job',
    company: data.company || 'Unknown',
    source: data.source || '',
    tier: data.tier || '',
    jobUrl: data.jobUrl || data.url || '',
    applyUrl: data.applyUrl || data.url || '',
    status: data.status || 'submitted',
    notes: data.notes || '',
    filledFields: data.filledFields || 0,
    attempts: data.attempts || 1,
    submittedAt: data.submittedAt || now,
    lastAttempted: data.lastAttempted || now,
  };

  localApplicationService.upsert(userId, jobId, {
    ...payload,
    submittedAt: payload.submittedAt?.toISOString?.() || payload.submittedAt,
    lastAttempted: payload.lastAttempted?.toISOString?.() || payload.lastAttempted,
  });

  if (env.mongoUri) {
    const app = await Application.findOneAndUpdate({ userId, jobId }, payload, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }).lean();
    return normalizeApp(app);
  }

  return localApplicationService.get(userId, jobId);
}

async function recordApplicationsFromJobs(userId, jobs = [], options = {}) {
  const status = options.status || 'submitted';
  const now = options.submittedAt || new Date();
  const results = [];
  for (const job of jobs) {
    if (!job?.jobId) continue;
    results.push(
      await upsertForUser(userId, job.jobId, {
        title: job.title,
        company: job.company,
        source: job.source,
        tier: job.tier,
        jobUrl: job.url || job.jobUrl,
        applyUrl: job.applyUrl || job.url,
        status,
        submittedAt: now,
        lastAttempted: now,
        attempts: 1,
      })
    );
  }
  return results;
}

async function activityForUser(userId) {
  const apps = await listForUser(userId, { limit: 50 });
  const recentApplied = apps.slice(0, 10).map((app) => ({
    jobId: app.jobId,
    title: app.title,
    company: app.company,
    url: app.applyUrl || app.jobUrl,
    source: app.source,
    status: app.status,
    submittedAt: app.submittedAt,
    lastAttempted: app.lastAttempted,
  }));

  const companies = [];
  const seen = new Set();
  for (const app of apps) {
    const company = (app.company || '').trim();
    if (!company || seen.has(company.toLowerCase())) continue;
    seen.add(company.toLowerCase());
    companies.push({
      name: company,
      jobId: app.jobId,
      title: app.title,
      status: app.status,
      appliedAt: app.submittedAt || app.lastAttempted,
    });
    if (companies.length >= 12) break;
  }

  const byStatus = apps.reduce((acc, app) => {
    const key = app.status || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    totalApplications: apps.length,
    submitted: (byStatus.submitted || 0) + (byStatus.queued || 0),
    queued: byStatus.queued || 0,
    recentApplied,
    companies,
    byStatus,
  };
}

module.exports = {
  listForUser,
  getForUserAndJob,
  upsertForUser,
  recordApplicationsFromJobs,
  activityForUser,
};
