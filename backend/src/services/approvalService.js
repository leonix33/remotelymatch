const crypto = require('crypto');
const JobApproval = require('../models/JobApproval');
const Job = require('../models/Job');
const env = require('../config/env');
const jobService = require('./jobService');
const profileService = require('./profileService');
const { scoreJobsForProfile } = require('./jobScoringService');
const teamService = require('./teamService');
const localApprovalService = require('./localApprovalService');
const applicationKitService = require('./applicationKitService');
const applicationKitStore = require('./applicationKitStore');
const { profileResumeAlignment } = require('./resumeParseService');

const JOB_LIST_CACHE_MS = 120_000;
const jobListCache = new Map();

function kitSummaryFromKit(kit, jobStatus) {
  if (!kit?.tailored) {
    return { hasKit: false, useForApply: null, pageCount: 0, applied: false };
  }
  return {
    hasKit: true,
    useForApply: kit.useForApply !== false,
    pageCount: kit.pageCount || 0,
    supplementPagesTarget: kit.supplementPagesTarget || kit.pageCount,
    tailorMode: kit.tailorMode || 'balanced',
    estimatedMatchPct: kit.estimatedMatchPct || null,
    generatedAt: kit.generatedAt,
    applied: jobStatus === 'applied' || jobStatus === 'submitted',
  };
}

function invalidateJobListCache(userId) {
  jobListCache.delete(String(userId));
}

function requireMongo() {
  if (!env.mongoUri) throw new Error('MongoDB is required');
}

async function loadJobs(minMatch = 60) {
  const limit = env.openJobMarket !== false ? 2000 : 500;
  if (env.mongoUri) {
    return Job.find({ matchPct: { $gte: minMatch } })
      .sort({ matchPct: -1 })
      .limit(limit)
      .lean();
  }
  return jobService.readJobsFromSqlite(5000).filter(
    (j) => (j.matchPct || 0) >= minMatch && j.emailSection !== 'manual_browse'
  );
}

async function buildJobList(userId) {
  const cacheKey = String(userId);
  const cached = jobListCache.get(cacheKey);
  if (cached && Date.now() - cached.at < JOB_LIST_CACHE_MS) {
    return cached.data;
  }

  const profile = await profileService.getOrCreate(userId);
  const openMarket = env.openJobMarket !== false;
  const minMatch = profile.minMatchScore || (openMarket ? 40 : 60);
  let jobs = await loadJobs(0);

  const hasSearchCriteria = Boolean(profile?.targetTitles?.length || profile?.mustHaveSkills?.length);
  const hasResume = Boolean((profile?.resumeText || '').trim().length >= 50);

  if (!hasSearchCriteria) {
    jobs = jobs.map((j) => {
      const agentMatch = j.matchPct || 0;
      const qualityBoost = j.qualityScore || j.score || 0;
      const baseline = openMarket
        ? Math.max(agentMatch, Math.min(80, 42 + Math.floor(qualityBoost / 4)))
        : agentMatch;
      return {
        ...j,
        personalMatchPct: baseline,
        matchPct: baseline,
        agentMatchPct: agentMatch,
      };
    });
    if (hasResume) {
      jobs = scoreJobsForProfile(jobs, profile, userId);
    }
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

    const result = jobs.map((job) => {
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
      };
    });
    jobListCache.set(cacheKey, { at: Date.now(), data: result });
    return result;
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

  const result = jobs.map((job) => {
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
    };
  });

  jobListCache.set(cacheKey, { at: Date.now(), data: result });
  return result;
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

  const base = await buildJobList(userId);
  const counts = { pending: 0, approved: 0, rejected: 0, applied: 0 };
  for (const job of base) {
    if (job.status in counts) counts[job.status] += 1;
  }

  const all = applyFilters(base, { statusFilter, search, minMatch, ats, sort });
  const total = all.length;
  const slice = limit > 0 ? all.slice(Number(offset), Number(offset) + Number(limit)) : all;

  const allKits = await applicationKitStore.listForUser(userId);
  const kitByJobId = new Map(allKits.map((kit) => [kit.jobId, kit]));

  const items = slice.map((job) => ({
    ...job,
    kit: kitSummaryFromKit(kitByJobId.get(job.jobId), job.status),
  }));

  let hint = null;
  if (total === 0 && statusFilter === 'pending') {
    const profile = await profileService.getOrCreate(userId);
    const alignment = profileResumeAlignment(profile);
    let rawJobCount = 0;
    if (env.mongoUri) {
      rawJobCount = await Job.countDocuments({});
    } else {
      rawJobCount = jobService.readJobsFromSqlite(500).length;
    }
    if (!rawJobCount) {
      hint = 'No jobs in the system yet. Run a job search from the Apply tab or ask an admin to refresh listings.';
    } else if (!alignment.aligned && alignment.reason) {
      hint = alignment.reason;
    } else if (Number(minMatch) > (profile.minMatchScore || 60)) {
      hint = `No jobs meet ${minMatch}% match. Try lowering your match threshold in Profile.`;
    } else {
      hint = 'No jobs meet your match threshold. Lower it in Profile or update your target roles and skills.';
    }
  }

  return { items, total, hint, counts };
}

async function loadJobSnapshots(jobIds) {
  const map = new Map();
  if (!jobIds?.length) return map;

  if (env.mongoUri) {
    const jobs = await Job.find({ jobId: { $in: jobIds } }).lean();
    for (const job of jobs) map.set(job.jobId, job);
    const missing = jobIds.filter((id) => !map.has(id));
    if (missing.length) {
      const approvals = await JobApproval.find({ jobId: { $in: missing } }).lean();
      for (const approval of approvals) {
        if (!map.has(approval.jobId)) {
          map.set(approval.jobId, {
            jobId: approval.jobId,
            title: approval.title,
            company: approval.company,
            url: approval.url,
            matchPct: approval.matchPct || 0,
            atsType: approval.atsType,
            source: approval.source,
          });
        }
      }
    }
  }

  for (const job of jobService.readJobsFromSqlite(5000)) {
    if (jobIds.includes(job.jobId) && !map.has(job.jobId)) {
      map.set(job.jobId, job);
    }
  }

  return map;
}

async function resolveJobSnapshot(userId, jobId, jobSnapshot) {
  if (jobSnapshot) return jobSnapshot;

  if (env.mongoUri) {
    const mongoJob = await Job.findOne({ jobId }).lean();
    if (mongoJob) return mongoJob;
    const approval = await JobApproval.findOne({ userId, jobId }).lean();
    if (approval) {
      return {
        jobId: approval.jobId,
        title: approval.title,
        company: approval.company,
        url: approval.url,
        matchPct: approval.matchPct || 0,
        atsType: approval.atsType,
        source: approval.source,
      };
    }
  }

  return jobService.readJobsFromSqlite(5000).find((j) => j.jobId === jobId) || null;
}

async function setStatus(userId, jobId, status, notes = '', options = {}) {
  if (status === 'approved' && env.mongoUri) {
    await teamService.checkLimit(userId, 'approval');
  }

  let job = await resolveJobSnapshot(userId, jobId, options.jobSnapshot);

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
      if (!options.skipKitGeneration) {
        await applicationKitService.generateOnApprove(userId, jobId, tailor, {
          authEmail: options.authEmail,
        });
      }
    }
    invalidateJobListCache(userId);
    return row;
  }

  if (!job) {
    const existing = await JobApproval.findOne({ userId, jobId });
    if (!existing) throw new Error('Job not found');
    job = existing;
  }

  invalidateJobListCache(userId);

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
    if (!options.skipKitGeneration) {
      await applicationKitService.generateOnApprove(userId, jobId, tailor, {
        authEmail: options.authEmail,
      });
    }
  }
  return approval;
}

async function bulkSetStatus(userId, jobIds, status, options = {}) {
  const jobMap = await loadJobSnapshots(jobIds);
  const results = [];
  for (const jobId of jobIds) {
    try {
      results.push(
        await setStatus(userId, jobId, status, '', {
          ...options,
          jobSnapshot: jobMap.get(jobId),
        })
      );
    } catch (err) {
      console.warn(`bulkSetStatus skip ${jobId}:`, err.message);
    }
  }
  invalidateJobListCache(userId);
  return results;
}

async function counts(userId) {
  if (env.mongoUri) {
    const rows = await JobApproval.find({ userId }).select('status').lean();
    return {
      pending: rows.filter((r) => r.status === 'pending').length,
      approved: rows.filter((r) => r.status === 'approved').length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
      applied: rows.filter((r) => r.status === 'applied').length,
    };
  }
  const local = localApprovalService.listForUser(userId);
  const rows = Object.values(local);
  return {
    pending: rows.filter((i) => i.status === 'pending').length,
    approved: rows.filter((i) => i.status === 'approved').length,
    rejected: rows.filter((i) => i.status === 'rejected').length,
    applied: rows.filter((i) => i.status === 'applied').length,
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
    invalidateJobListCache(userId);
    return;
  }
  requireMongo();
  await JobApproval.updateMany(
    { userId, jobId: { $in: jobIds }, status: 'approved' },
    { status: 'applied', reviewedAt: new Date() }
  );
  invalidateJobListCache(userId);
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
      await require('./queueNotifyService').notifyQueuedJob(userId, result);
    } catch (err) {
      console.warn('Queue notify failed:', err.message);
    }
  }

  invalidateJobListCache(userId);
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
      await require('./queueNotifyService').notifyQueuedJob(userId, result);
    } catch (err) {
      console.warn('Queue notify failed:', err.message);
    }
  }

  invalidateJobListCache(userId);
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
