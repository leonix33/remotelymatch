const profileService = require('./profileService');
const applicationService = require('./applicationService');
const jobService = require('./jobService');
const localApprovalService = require('./localApprovalService');
const applicationKitStore = require('./applicationKitStore');
const jobDescriptionService = require('./jobDescriptionService');
const resumeTailorService = require('./resumeTailorService');
const applicantContactService = require('./applicantContactService');
const env = require('../config/env');

async function findJob(userId, jobId) {
  const fromFeed = jobService.readJobsFromSqlite(5000).find((j) => j.jobId === jobId);
  if (fromFeed) return fromFeed;

  if (env.mongoUri) {
    const Job = require('../models/Job');
    const JobApproval = require('../models/JobApproval');
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
        source: approval.source,
        atsType: approval.atsType,
      };
    }
  }

  const approval = localApprovalService.get(userId, jobId);
  if (approval) {
    return {
      jobId: approval.jobId,
      title: approval.title,
      company: approval.company,
      url: approval.url,
      matchPct: approval.matchPct || 0,
      source: approval.source,
      atsType: approval.atsType,
    };
  }
  return null;
}

async function getKit(userId, jobId) {
  return applicationKitStore.get(userId, jobId);
}

async function generateForJob(userId, jobId, options = {}) {
  const { tailorResume = true, force = false, authEmail, tailorFocus } = options;

  if (!tailorResume) {
    return {
      jobId,
      tailored: false,
      mode: 'none',
      message: 'Resume tailoring is off for this application.',
    };
  }

  const existing = await applicationKitStore.get(userId, jobId);
  if (existing?.tailored && !force) {
    return existing;
  }

  const profile = await profileService.getOrCreate(userId);
  const supplementPages = resumeTailorService.clampPageCount(
    options.supplementPages ?? existing?.supplementPagesTarget ?? profile.defaultSupplementPages ?? 3
  );
  const tailorMode =
    options.tailorMode === 'high_match' || options.tailorMode === 'balanced'
      ? options.tailorMode
      : existing?.tailorMode || profile.defaultTailorMode || 'balanced';
  const highMatchTarget = options.highMatchTarget ?? existing?.highMatchTarget ?? profile.highMatchTarget ?? 90;

  if (!(profile?.resumeText || '').trim() || profile.resumeText.trim().length < 50) {
    const err = new Error('Add your resume in Profile before generating a tailored application kit.');
    err.status = 400;
    throw err;
  }

  const job = options.job || (await findJob(userId, jobId));
  if (!job) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }

  const jobDescription = await jobDescriptionService.resolveJobDescription(job);
  const contact = await applicantContactService.resolveApplicantContact(userId, profile, authEmail);
  if (!contact.email) {
    const err = new Error('Add your personal email in Profile → Email & follow-ups before generating a tailored kit.');
    err.status = 400;
    throw err;
  }
  const kit = await resumeTailorService.generateAdditiveKit({
    userId,
    profile,
    job,
    jobDescription,
    contact,
    tailorFocus: tailorFocus || existing?.tailorFocus || '',
    supplementPages,
    tailorMode,
    highMatchTarget,
  });

  return applicationKitStore.set(userId, jobId, {
    ...kit,
    jobId,
    jobTitle: job.title,
    company: job.company,
    jobUrl: job.url,
    formatted: resumeTailorService.formatKitAsText(kit),
    generatedAt: new Date().toISOString(),
    useForApply: existing?.useForApply !== false,
    tailorFocus: tailorFocus !== undefined ? String(tailorFocus).slice(0, 2000) : existing?.tailorFocus || '',
    supplementPagesTarget: supplementPages,
    tailorMode,
    highMatchTarget,
  });
}

async function generateOnApprove(userId, jobId, tailorResume, options = {}) {
  if (!tailorResume) return null;
  try {
    return await generateForJob(userId, jobId, { tailorResume: true, ...options });
  } catch (err) {
    console.warn(`Application kit generation failed for ${jobId}:`, err.message);
    return null;
  }
}

function attachApplicantFields(base, contact) {
  if (!contact?.email) return base;
  return {
    ...base,
    applicant_email: contact.email,
    applicant_name: contact.name || base.applicant_name,
    applicant_phone: contact.phone || base.applicant_phone,
    applicant_linkedin: contact.linkedin || base.applicant_linkedin,
    applicant_github: contact.github || base.applicant_github,
    applicant_portfolio: contact.portfolio || base.applicant_portfolio,
  };
}

async function attachKitToApplyItem(userId, job, options = {}) {
  const { useTailoredResume = false, contact, kit: kitOverride } = options;
  const base = attachApplicantFields(
    {
      ...job,
      use_tailored_resume: useTailoredResume,
    },
    contact
  );
  if (!useTailoredResume) return base;

  const kit = kitOverride || (await applicationKitStore.get(userId, job.id || job.jobId));
  if (!kit?.tailored || kit.useForApply === false) {
    return { ...base, use_tailored_resume: false };
  }

  return {
    ...base,
    cover_letter: kit.coverLetterParagraph || '',
    resume_addendum: kit.tailoredResumeText || kit.fullSupplementText || kit.resumeAddendum || '',
    applicant_email: kit.contactEmail || base.applicant_email,
    applicant_name: kit.contactName || base.applicant_name,
    application_kit: {
      pageCount: kit.pageCount,
      missingKeywords: kit.missingKeywords || [],
      additiveBullets: kit.additiveBullets || [],
      formatted: kit.formatted || '',
    },
  };
}

async function prepareApplyItems(userId, jobs, options = {}) {
  const { useTailoredResume = false, authEmail } = options;
  const profile = userId ? await profileService.getOrCreate(userId) : null;
  const contact = profile
    ? await applicantContactService.resolveApplicantContact(userId, profile, authEmail)
    : null;

  if (!useTailoredResume) {
    const items = [];
    for (const job of jobs) {
      items.push(await attachKitToApplyItem(userId, job, { useTailoredResume: false, contact }));
    }
    return { items, tailoredCount: 0, missingKitCount: 0 };
  }

  let tailoredCount = 0;
  let missingKitCount = 0;
  let optedOutCount = 0;

  const items = [];
  for (const job of jobs) {
    const jobId = job.jobId || job.id;
    let kit = await applicationKitStore.get(userId, jobId);
    if (!kit?.tailored) {
      try {
        kit = await generateForJob(userId, jobId, {
          tailorResume: true,
          authEmail,
          job,
          supplementPages: profile?.defaultSupplementPages,
          tailorMode: profile?.defaultTailorMode,
          highMatchTarget: profile?.highMatchTarget,
        });
      } catch (err) {
        console.warn(`Kit generation failed for ${jobId}:`, err.message);
        missingKitCount += 1;
      }
    }

    const useThisKit = Boolean(kit?.tailored && kit.useForApply !== false);
    if (kit?.tailored && kit.useForApply === false) optedOutCount += 1;
    else if (useThisKit) tailoredCount += 1;
    else if (!kit?.tailored) missingKitCount += 1;

    const applyBase = {
      id: jobId,
      title: job.title,
      company: job.company,
      location: job.location || 'Remote',
      url: job.url,
      source: job.source,
      score: job.score || 50,
      tier: job.tier || 'SECONDARY',
      match_pct: job.personalMatchPct || job.matchPct || 0,
      ats_type: job.atsType || job.ats_type,
      email_section: job.emailSection || job.email_section || 'strong_review',
    };
    items.push(
      await attachKitToApplyItem(userId, applyBase, {
        useTailoredResume: useThisKit,
        contact,
        kit,
      })
    );
  }

  return { items, tailoredCount, missingKitCount, optedOutCount };
}

async function applicationMetaForJob(userId, jobId) {
  const app = await applicationService.getForUserAndJob(userId, jobId);
  let approvalStatus = null;
  if (env.mongoUri) {
    const JobApproval = require('../models/JobApproval');
    const approval = await JobApproval.findOne({ userId, jobId }).select('status').lean();
    approvalStatus = approval?.status || null;
  } else {
    approvalStatus = localApprovalService.get(userId, jobId)?.status || null;
  }
  const applicationStatus = app?.status || null;
  const applied =
    applicationStatus === 'submitted' ||
    applicationStatus === 'queued' ||
    approvalStatus === 'applied' ||
    Boolean(app?.submittedAt);
  return {
    applied,
    applicationStatus,
    approvalStatus,
    submittedAt: app?.submittedAt || null,
    lastAttempted: app?.lastAttempted || null,
  };
}

function kitListItem(kit) {
  return {
    jobId: kit.jobId,
    jobTitle: kit.jobTitle,
    company: kit.company,
    jobUrl: kit.jobUrl,
    pageCount: kit.pageCount || kit.supplementPages?.length || 0,
    supplementPagesTarget: kit.supplementPagesTarget || kit.pageCount || 3,
    tailorMode: kit.tailorMode || 'balanced',
    highMatchTarget: kit.highMatchTarget || 90,
    estimatedMatchPct: kit.estimatedMatchPct || null,
    generatedAt: kit.generatedAt,
    updatedAt: kit.updatedAt,
    useForApply: kit.useForApply !== false,
    tailorFocus: kit.tailorFocus || '',
    contactEmail: kit.contactEmail || '',
    demo: Boolean(kit.demo),
    hasCoverLetter: Boolean(kit.coverLetterParagraph),
    missingKeywords: (kit.missingKeywords || []).slice(0, 8),
    tailored: Boolean(kit.tailored),
    tailoredResumeText: kit.tailoredResumeText || kit.fullSupplementText || '',
    supplementPages: kit.supplementPages || [],
    fullSupplementText: kit.fullSupplementText || '',
    coverLetterParagraph: kit.coverLetterParagraph || '',
    formatted: kit.formatted || '',
    contactName: kit.contactName || '',
  };
}

async function listKits(userId) {
  const kits = await applicationKitStore.listForUser(userId);
  return kits.map((kit) => kitListItem(kit));
}

async function setKitPreference(userId, jobId, { useForApply, tailorFocus, supplementPages, tailorMode, highMatchTarget }) {
  const existing = await applicationKitStore.get(userId, jobId);
  if (!existing?.tailored) {
    const err = new Error('No tailored kit for this job yet. Generate one first.');
    err.status = 404;
    throw err;
  }
  const patch = {};
  if (useForApply !== undefined) patch.useForApply = Boolean(useForApply);
  if (tailorFocus !== undefined) patch.tailorFocus = String(tailorFocus).slice(0, 2000);
  if (supplementPages !== undefined) {
    patch.supplementPagesTarget = resumeTailorService.clampPageCount(supplementPages);
  }
  if (tailorMode === 'high_match' || tailorMode === 'balanced') patch.tailorMode = tailorMode;
  if (highMatchTarget !== undefined) patch.highMatchTarget = Math.min(98, Math.max(80, Number(highMatchTarget) || 90));
  return applicationKitStore.patchMeta(userId, jobId, patch);
}

async function kitSummary(userId, jobId) {
  const kit = await applicationKitStore.get(userId, jobId);
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
    tailorFocus: kit.tailorFocus || '',
    ...(await applicationMetaForJob(userId, jobId)),
  };
}

async function getKitsForJobIds(userId, jobIds = []) {
  const kits = [];
  for (const jobId of jobIds) {
    const kit = await applicationKitStore.get(userId, jobId);
    if (kit?.tailored) kits.push(kit);
  }
  return kits;
}

module.exports = {
  getKit,
  generateForJob,
  generateOnApprove,
  attachKitToApplyItem,
  prepareApplyItems,
  findJob,
  listKits,
  setKitPreference,
  kitSummary,
  applicationMetaForJob,
  getKitsForJobIds,
  kitListItem,
};
