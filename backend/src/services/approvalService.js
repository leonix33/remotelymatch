const crypto = require('crypto');
const JobApproval = require('../models/JobApproval');
const Job = require('../models/Job');
const env = require('../config/env');
const jobService = require('./jobService');
const profileService = require('./profileService');
const { scoreJobsForProfile } = require('./jobScoringService');
const teamService = require('./teamService');
const localApprovalService = require('./localApprovalService');
const queueNotifyService = require('./queueNotifyService');
const applicationKitService = require('./applicationKitService');

function requireMongo() {
  if (!env.mongoUri) throw new Error('MongoDB is required');
}

async function loadJobs(minMatch = 60) {
  if (env.mongoUri) {
    return Job.find({ matchPct: { $gte: minMatch } })
      .sort({ matchPct: -1 })
      .limit(500)
      .lean();
  }
  return jobService.readJobsFromSqlite(5000).filter(
    (j) => (j.matchPct || 0) >= minMatch && j.emailSection !== 'manual_browse'
  );
}

async function buildJobList(userId) {
  const profile = await profileService.getOrCreate(userId);
  const minMatch = profile.minMatchScore || 60;
  let jobs = await loadJobs(0);

  const profileEmpty = !(profile?.targetTitles?.length || profile?.mustHaveSkills?.length);
  if (profileEmpty) {
    jobs = jobs.map((j) => ({
      ...j,
      personalMatchPct: j.matchPct || 0,
      matchPct: j.matchPct || 0,
      agentMatchPct: j.matchPct || 0,
    }));
  } else {
    jobs = scoreJobsForProfile(jobs, profile, userId);
  }

  jobs = jobs.filter((j) => (j.personalMatchPct ?? j.matchPct ?? 0) >= minMatch);

  if (!env.mongoUri) {
    const local = localApprovalService.listForUser(userId);
    const seen = new Set(jobs.map((j) => j.jobId));

    for (const [jobId, row] of Object.entries(local)) {
      if (!seen.has(jobId) && jobId.startsWith('ext-')) {
        jobs.unshift({
          jobId: row.jobId,
          title: row.title,
          company: row.company,
          url: row.url,
          matchPct: row.matchPct || 0,
          personalMatchPct: row.matchPct || 0,
          source: row.source || 'chrome-extension',
          atsType: row.atsType,
        });
      }
    }

    return jobs.map((job) => {
      const row = local[job.jobId];
      return {
        jobId: job.jobId,
        title: job.title,
        company: job.company,
        url: job.url,
        matchPct: job.matchPct,
        personalMatchPct: job.personalMatchPct ?? job.matchPct,
        agentMatchPct: job.agentMatchPct ?? job.matchPct,
        atsType: job.atsType,
        source: job.source,
        emailSection: job.emailSection,
        status: row?.status || 'pending',
        notes: row?.notes || '',
        reviewedAt: row?.reviewedAt,
        kit: applicationKitService.kitSummary(userId, job.jobId),
      };
    });
  }

  const approvals = await JobApproval.find({ userId }).lean();
  const byJob = new Map(approvals.map((a) => [a.jobId, a]));

  const jobIdsInFeed = new Set(jobs.map((j) => j.jobId));
  for (const a of approvals) {
    if (!jobIdsInFeed.has(a.jobId) && a.jobId.startsWith('ext-')) {
      jobs.push({
        jobId: a.jobId,
        title: a.title,
        company: a.company,
        url: a.url,
        matchPct: a.matchPct || 0,
        atsType: a.atsType,
        source: a.source || 'chrome-extension',
        personalMatchPct: a.matchPct || 0,
      });
    }
  }

  return jobs.map((job) => {
    const existing = byJob.get(job.jobId);
    return {
      jobId: job.jobId,
      title: job.title,
      company: job.company,
      url: job.url,
      matchPct: job.matchPct,
      personalMatchPct: job.personalMatchPct ?? job.matchPct,
      agentMatchPct: job.matchPct,
      atsType: job.atsType,
      source: job.source,
      emailSection: job.emailSection,
      status: existing?.status || 'pending',
      notes: existing?.notes || '',
      reviewedAt: existing?.reviewedAt,
      _id: existing?._id,
      kit: applicationKitService.kitSummary(userId, job.jobId),
    };
  });
}

function applyFilters(items, { statusFilter, search, minMatch, ats, sort }) {
  let list = items;
  if (statusFilter && statusFilter !== 'all') {
    list = list.filter((j) => j.status === statusFilter);
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(
      (j) =>
        j.title?.toLowerCase().includes(q) ||
        j.company?.toLowerCase().includes(q) ||
        j.source?.toLowerCase().includes(q)
    );
  }
  if (minMatch) {
    const min = Number(minMatch);
    list = list.filter((j) => (j.personalMatchPct ?? j.matchPct ?? 0) >= min);
  }
  if (ats && ats !== 'all') {
    list = list.filter((j) => (j.atsType || '').toLowerCase() === ats.toLowerCase());
  }
  if (sort === 'company') {
    list = [...list].sort((a, b) => (a.company || '').localeCompare(b.company || ''));
  } else {
    list = [...list].sort(
      (a, b) =>
        (b.interviewLikelihoodPct ?? 0) - (a.interviewLikelihoodPct ?? 0) ||
        (b.personalMatchPct ?? b.matchPct ?? 0) - (a.personalMatchPct ?? a.matchPct ?? 0)
    );
  }
  return list;
}

async function listForUser(userId, options = {}) {
  const {
    status: statusFilter = 'pending',
    search = '',
    minMatch = '',
    ats = '',
    sort = 'match',
    limit = 0,
    offset = 0,
  } = options;

  const all = applyFilters(await buildJobList(userId), { statusFilter, search, minMatch, ats, sort });
  const total = all.length;
  const slice = limit > 0 ? all.slice(Number(offset), Number(offset) + Number(limit)) : all;
  return { items: slice, total };
}

async function setStatus(userId, jobId, status, notes = '', options = {}) {
  if (status === 'approved' && env.mongoUri) {
    await teamService.checkLimit(userId, 'approval');
  }

  let job = (await loadJobs(0)).find((j) => j.jobId === jobId);

  if (!env.mongoUri) {
    const existing = localApprovalService.get(userId, jobId);
    if (!job && !existing) throw new Error('Job not found');
    const row = localApprovalService.set(userId, jobId, {
      ...(existing || {}),
      title: job?.title || existing?.title || 'External job',
      company: job?.company || existing?.company || 'Unknown',
      url: job?.url || existing?.url || '',
      matchPct: job?.matchPct ?? existing?.matchPct ?? 0,
      atsType: job?.atsType || existing?.atsType,
      source: job?.source || existing?.source,
      status,
      notes,
      reviewedAt: new Date().toISOString(),
    });
    if (status === 'approved') {
      const profile = await profileService.getOrCreate(userId);
      const tailor =
        typeof options.tailorResume === 'boolean' ? options.tailorResume : Boolean(profile.tailorResumeOnApply);
      await applicationKitService.generateOnApprove(userId, jobId, tailor, {
        authEmail: options.authEmail,
      });
    }
    return row;
  }

  if (!job) {
    const existing = await JobApproval.findOne({ userId, jobId });
    if (!existing) throw new Error('Job not found');
    job = existing;
  }

  const approval = await JobApproval.findOneAndUpdate(
    { userId, jobId },
    {
      userId,
      jobId,
      title: job.title,
      company: job.company,
      url: job.url,
      matchPct: job.matchPct,
      atsType: job.atsType,
      source: job.source,
      status,
      notes,
      reviewedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  if (status === 'approved') {
    await teamService.incrementUsage(userId, 'approval');
    const profile = await profileService.getOrCreate(userId);
    const tailor =
      typeof options.tailorResume === 'boolean' ? options.tailorResume : Boolean(profile.tailorResumeOnApply);
    await applicationKitService.generateOnApprove(userId, jobId, tailor, {
      authEmail: options.authEmail,
    });
  }
  return approval;
}

async function bulkSetStatus(userId, jobIds, status, options = {}) {
  const results = [];
  for (const jobId of jobIds) {
    try {
      results.push(await setStatus(userId, jobId, status, '', options));
    } catch {
      /* skip failures */
    }
  }
  return results;
}

async function counts(userId) {
  const items = await buildJobList(userId);
  return {
    pending: items.filter((i) => i.status === 'pending').length,
    approved: items.filter((i) => i.status === 'approved').length,
    rejected: items.filter((i) => i.status === 'rejected').length,
    applied: items.filter((i) => i.status === 'applied').length,
  };
}

async function listApproved(userId) {
  if (!env.mongoUri) {
    const items = await buildJobList(userId);
    return items.filter((i) => i.status === 'approved');
  }
  requireMongo();
  const approvals = await JobApproval.find({ userId, status: 'approved' }).lean();
  const allJobs = jobService.readJobsFromSqlite(5000);
  const jobMap = new Map(allJobs.map((j) => [j.jobId, j]));
  return approvals.map((a) => {
    const job = jobMap.get(a.jobId) || {
      jobId: a.jobId,
      title: a.title,
      company: a.company,
      url: a.url,
      matchPct: a.matchPct,
      atsType: a.atsType,
      source: a.source,
      tier: 'SECONDARY',
      score: 50,
      location: 'Remote',
      emailSection: 'strong_review',
    };
    return { ...job, approvalId: a._id, notes: a.notes };
  });
}

async function markApplied(userId, jobIds) {
  if (!env.mongoUri) {
    for (const jobId of jobIds) {
      const row = localApprovalService.get(userId, jobId);
      if (row?.status === 'approved') {
        localApprovalService.set(userId, jobId, { ...row, status: 'applied' });
      }
    }
    return;
  }
  requireMongo();
  await JobApproval.updateMany(
    { userId, jobId: { $in: jobIds }, status: 'approved' },
    { status: 'applied', reviewedAt: new Date() }
  );
}

async function addExternal(userId, { url, title, company, source, notify = true }) {
  if (!url) throw new Error('URL is required');
  const jobId = `ext-${crypto.createHash('sha256').update(url).digest('hex').slice(0, 16)}`;
  const row = {
    jobId,
    title: title || 'External job',
    company: company || 'Unknown',
    url,
    matchPct: 0,
    source: source || 'chrome-extension',
    status: 'pending',
    notes: 'Queued from browser extension',
  };

  let existing;
  if (env.mongoUri) {
    existing = await JobApproval.findOne({ userId, jobId }).lean();
  } else {
    existing = localApprovalService.get(userId, jobId);
  }

  const isNew = !existing || existing.status === 'rejected';

  let saved;
  if (env.mongoUri) {
    saved = await JobApproval.findOneAndUpdate(
      { userId, jobId },
      { userId, jobId, ...row, reviewedAt: null },
      { upsert: true, new: true }
    );
  } else {
    saved = localApprovalService.set(userId, jobId, row);
  }

  const result = {
    jobId,
    title: row.title,
    company: row.company,
    url: row.url,
    source: row.source,
    status: 'pending',
    isNew,
  };

  if (notify && isNew) {
    try {
      await queueNotifyService.notifyQueuedJob(userId, result);
    } catch (err) {
      console.warn('Queue notify failed:', err.message);
    }
  }

  return result;
}

async function ingestLinkedInJobs(userId, { jobs = [], notify = true }) {
  if (!Array.isArray(jobs) || !jobs.length) {
    return { ingested: 0, skipped: 0, items: [] };
  }

  const items = [];
  let ingested = 0;
  let skipped = 0;

  for (const job of jobs) {
    if (!job?.url) continue;
    try {
      const item = await addExternal(userId, {
        url: job.url,
        title: job.title,
        company: job.company,
        source: 'linkedin',
        notify,
      });
      items.push(item);
      if (item.isNew) ingested += 1;
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }

  return { ingested, skipped, items };
}

async function queueJob(userId, { jobId, title, company, url, matchPct = 0, atsType, source = 'user', notify = true }) {
  if (!jobId) throw new Error('jobId is required');

  let job = (await loadJobs(0)).find((j) => j.jobId === jobId);
  const row = {
    jobId,
    title: job?.title || title || 'Job',
    company: job?.company || company || 'Unknown',
    url: job?.url || url || '',
    matchPct: job?.personalMatchPct ?? job?.matchPct ?? matchPct ?? 0,
    atsType: job?.atsType || atsType,
    source: job?.source || source,
    status: 'pending',
    notes: '',
    reviewedAt: null,
  };

  let existing;
  if (!env.mongoUri) {
    existing = localApprovalService.get(userId, jobId);
  } else {
    existing = await JobApproval.findOne({ userId, jobId }).lean();
  }
  const isNew = !existing || existing.status === 'rejected';

  let saved;
  if (!env.mongoUri) {
    saved = localApprovalService.set(userId, jobId, row);
  } else {
    saved = await JobApproval.findOneAndUpdate(
      { userId, jobId },
      { userId, jobId, ...row },
      { upsert: true, new: true }
    );
  }

  const result = {
    jobId,
    title: row.title,
    company: row.company,
    url: row.url,
    source: row.source,
    matchPct: row.matchPct,
    status: 'pending',
    isNew,
  };

  if (notify && isNew) {
    try {
      await queueNotifyService.notifyQueuedJob(userId, result);
    } catch (err) {
      console.warn('Queue notify failed:', err.message);
    }
  }

  return result;
}

module.exports = {
  listForUser,
  setStatus,
  bulkSetStatus,
  counts,
  listApproved,
  markApplied,
  addExternal,
  ingestLinkedInJobs,
  queueJob,
};
