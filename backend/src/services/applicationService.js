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
    matchPct: data.matchPct ?? data.personalMatchPct ?? null,
    personalMatchPct: data.personalMatchPct ?? data.matchPct ?? null,
    interviewLikelihoodPct: data.interviewLikelihoodPct ?? null,
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
        personalMatchPct: job.personalMatchPct ?? job.matchPct ?? null,
        matchPct: job.personalMatchPct ?? job.matchPct ?? null,
        interviewLikelihoodPct: job.interviewLikelihoodPct ?? null,
        submittedAt: now,
        lastAttempted: now,
        attempts: 1,
      })
    );
  }

  let emailNotification = null;
  if (options.notify !== false && results.length) {
    try {
      const followUpDraftService = require('./followUpDraftService');
      const followUpScheduleService = require('./followUpScheduleService');
      await followUpDraftService.generateForJobs(userId, jobs, { authEmail: options.authEmail });
      for (const job of jobs) {
        await followUpScheduleService.scheduleForApplication(userId, job, now);
      }
    } catch (err) {
      console.warn('Follow-up kit generation failed:', err.message);
    }

    try {
      const tractionService = require('./tractionService');
      emailNotification = await tractionService.sendPostApplyFeedback(userId, jobs, {
        authEmail: options.authEmail,
        useTailoredResume: options.useTailoredResume,
        queued: Boolean(options.queued) || status === 'queued',
        preparedOnly: Boolean(options.preparedOnly),
        status,
      });
      if (emailNotification.sent) {
        console.log(`Apply traction email sent to ${emailNotification.to}`);
      } else {
        console.warn(`Apply traction email skipped: ${emailNotification.reason}`);
      }
    } catch (err) {
      console.warn('Apply traction email failed:', err.message);
      emailNotification = { sent: false, reason: err.message };
    }
  }

  return { applications: results, emailNotification };
}

async function reapplyForJob(userId, jobId, options = {}) {
  const app = await getForUserAndJob(userId, jobId);
  if (!app) {
    const err = new Error('No application found for this role');
    err.status = 404;
    throw err;
  }

  const applicationKitService = require('./applicationKitService');
  const profileService = require('./profileService');
  const jobService = require('./jobService');
  const followUpDraftService = require('./followUpDraftService');
  const { scoreJobsForProfile } = require('./jobScoringService');
  const applicantContactService = require('./applicantContactService');

  const useTailoredResume = options.useTailoredResume !== false;
  const profile = await profileService.getOrCreate(userId);

  if (useTailoredResume) {
    const kit = await applicationKitService.getKit(userId, jobId);
    if (!kit?.tailored) {
      const err = new Error('Polish your application kit first — then reapply with the tailored resume.');
      err.status = 400;
      throw err;
    }
  }

  const job = (await applicationKitService.findJob(userId, jobId)) || {
    jobId,
    title: app.title,
    company: app.company,
    url: app.applyUrl || app.jobUrl,
    source: app.source,
  };

  const [scored] = scoreJobsForProfile([job], profile, userId);
  const agentAvailable = jobService.isAgentApplyAvailable();
  const contact = await applicantContactService.resolveApplicantContact(userId, profile, options.authEmail);
  const applicantEnv = {};
  if (contact.email) applicantEnv.APPLICANT_EMAIL = contact.email;
  if (contact.name) applicantEnv.APPLICANT_NAME = contact.name;
  if (contact.phone) applicantEnv.APPLICANT_PHONE = contact.phone;
  if (contact.linkedin) applicantEnv.LINKEDIN_URL = contact.linkedin;
  if (contact.github) applicantEnv.GITHUB_URL = contact.github;
  if (contact.portfolio) applicantEnv.PORTFOLIO_URL = contact.portfolio;

  const { file: itemsFile, tailoredCount, missingKitCount } = await jobService.writeApprovedItemsFile(
    [scored],
    userId,
    { useTailoredResume, authEmail: options.authEmail }
  );

  let output = '';
  let status = 'submitted';
  let queued = false;

  try {
    if (agentAvailable) {
      output = await jobService.runApprovedAutoApply(itemsFile, applicantEnv);
    } else {
      throw new Error(
        'Python agent not on this server. Kits saved — run apply from your Mac with AGENT_HOME set.'
      );
    }
  } catch (applyErr) {
    const unavailable = !agentAvailable || jobService.isAgentUnavailableError(applyErr);
    if (unavailable) {
      status = 'queued';
      queued = true;
      output = applyErr.message;
    } else {
      throw applyErr;
    }
  }

  const now = new Date();
  await upsertForUser(userId, jobId, {
    title: app.title,
    company: app.company,
    source: app.source,
    jobUrl: app.jobUrl || job.url,
    applyUrl: app.applyUrl || job.url,
    status,
    submittedAt: now,
    lastAttempted: now,
    attempts: (app.attempts || 1) + 1,
    personalMatchPct: scored.personalMatchPct ?? app.personalMatchPct,
    matchPct: scored.personalMatchPct ?? app.matchPct,
    interviewLikelihoodPct: scored.interviewLikelihoodPct ?? app.interviewLikelihoodPct,
  });

  try {
    await followUpDraftService.generateFollowUpKit(userId, jobId, {
      authEmail: options.authEmail,
      job: scored,
      daysSinceApply: 0,
    });
  } catch (err) {
    console.warn('Follow-up kit refresh after reapply failed:', err.message);
  }

  const modeLabel = useTailoredResume ? 'tailored resume' : 'base resume';
  return {
    message: queued
      ? `Reapply queued for ${app.title} — submit via Chrome extension or local agent`
      : `Reapplied to ${app.title} with ${modeLabel}`,
    jobId,
    status,
    queued,
    useTailoredResume,
    tailoredCount,
    missingKitCount,
    output: output.slice(-2000),
  };
}

async function activityForUser(userId) {
  const apps = await listForUser(userId, { limit: 100 });
  const appliedApps = apps.filter((a) =>
    ['submitted', 'queued', 'manual-review', 'email-apply', 'external-apply'].includes(a.status) ||
    a.submittedAt
  );

  const recentApplied = appliedApps.slice(0, 25).map((app) => ({
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
  for (const app of appliedApps) {
    const company = (app.company || '').trim();
    if (!company || seen.has(company.toLowerCase())) continue;
    seen.add(company.toLowerCase());
    companies.push({
      name: company,
      jobId: app.jobId,
      title: app.title,
      status: app.status,
      appliedAt: app.submittedAt || app.lastAttempted,
      url: app.applyUrl || app.jobUrl,
    });
    if (companies.length >= 30) break;
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
  reapplyForJob,
  activityForUser,
};
