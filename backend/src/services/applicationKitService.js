const profileService = require('./profileService');
const applicationService = require('./applicationService');
const jobService = require('./jobService');
const localApprovalService = require('./localApprovalService');
const applicationKitStore = require('./applicationKitStore');
const { buildKitSummary, isKitReadyToApply, READY_ATS_MIN } = require('./kitReadinessService');
const activityService = require('./activityService');
const jobDescriptionService = require('./jobDescriptionService');
const resumeTailorService = require('./resumeTailorService');
const applicantContactService = require('./applicantContactService');
const openaiService = require('./openaiService');
const env = require('../config/env');
const { resolveTailorOptions, ATS_TARGET_MIN, KIT_PIPELINE_VERSION, POLISH_INTERACTIVE_MAX_PASSES } = require('../config/tailorDefaults');

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

  const app = await applicationService.getForUserAndJob(userId, jobId);
  if (app) {
    return {
      jobId: app.jobId,
      title: app.title,
      company: app.company,
      url: app.applyUrl || app.jobUrl || '',
      matchPct: app.matchPct || app.personalMatchPct || 0,
      source: app.source,
    };
  }

  const kit = await applicationKitStore.get(userId, jobId);
  if (kit?.tailored) {
    return {
      jobId,
      title: kit.jobTitle || kit.title || 'Role',
      company: kit.company || 'Company',
      url: kit.jobUrl || kit.url || '',
      source: kit.source,
    };
  }

  return null;
}

async function persistEnrichedKit(userId, jobId, kit) {
  if (!kit?.tailored) return kit;
  const profile = await profileService.getOrCreate(userId);
  const originalResume = profile?.resumeText || '';
  const enriched = resumeTailorService.enrichKitForDisplay(kit, originalResume);
  const changed =
    enriched.tailoredResumeText !== kit.tailoredResumeText ||
    enriched.pageCount !== kit.pageCount ||
    kit.pipelineVersion !== KIT_PIPELINE_VERSION;

  if (changed) {
    return applicationKitStore.set(userId, jobId, {
      ...enriched,
      pipelineVersion: KIT_PIPELINE_VERSION,
    });
  }
  return enriched;
}

async function getKit(userId, jobId) {
  let kit = await applicationKitStore.get(userId, jobId);
  if (!kit?.tailored) return kit;

  const needsRegeneration = kit.pipelineVersion !== KIT_PIPELINE_VERSION;
  kit = await persistEnrichedKit(userId, jobId, kit);

  try {
    const job = await findJob(userId, jobId);
    if (job) {
      const jobDescription = await jobDescriptionService.resolveJobDescription(job);
      kit = resumeTailorService.applyAtsMetadata(kit, jobDescription, job);
    }
  } catch {
    // keep stored kit scores if JD unavailable
  }

  if (needsRegeneration) {
    return {
      ...kit,
      needsRegeneration: true,
      targetPipelineVersion: KIT_PIPELINE_VERSION,
    };
  }
  return kit;
}

async function ensureMinimumAtsScore(
  userId,
  kit,
  profile,
  job,
  jobDescription,
  contact,
  tailorFocus = '',
  options = {}
) {
  if (!kit?.tailored) return kit;

  let working = resumeTailorService.applyAtsMetadata(kit, jobDescription, job);
  if ((working.atsScore ?? 0) >= ATS_TARGET_MIN) return working;

  const { getRedTerms } = require('./atsKeywordService');
  const maxRounds = Math.max(0, Number(options.maxRounds ?? 3));

  for (let round = 0; round < maxRounds && (working.atsScore ?? 0) < ATS_TARGET_MIN; round += 1) {
    const focusParts = [
      ...(working.uncoveredRequirements || []),
      ...getRedTerms(working, 12),
    ].filter(Boolean);
    const focus = focusParts.length ? focusParts.slice(0, 12).join(', ') : tailorFocus;

    working = await resumeTailorService.polishExistingKit({
      userId,
      profile,
      job,
      jobDescription,
      contact,
      kit: working,
      tailorFocus: focus,
      highMatchTarget: ATS_TARGET_MIN,
      maxPasses: options.maxPasses ?? 4,
    });
    working = resumeTailorService.applyAtsMetadata(working, jobDescription, job);
  }

  return working;
}

function formatKitGenerationError(err) {
  const msg = String(err?.message || err || '');
  if (err?.status) {
    const error = new Error(msg);
    error.status = err.status;
    return error;
  }
  if (/abort|timeout|timed out|ETIMEDOUT|ECONNABORTED/i.test(msg)) {
    const error = new Error(
      'Resume tailoring timed out. Try again — if it keeps failing, use Queue → Polish until ready for this role.'
    );
    error.status = 504;
    return error;
  }
  if (/rate limit|429|quota|insufficient/i.test(msg)) {
    const error = new Error('OpenAI rate limit hit. Wait a minute and try Generate kit again.');
    error.status = 429;
    return error;
  }
  if (/invalid_api_key|authentication|401/i.test(msg)) {
    const error = new Error(
      'OpenAI key rejected. Update your key in Profile → AI Integration or ask admin to refresh the server key.'
    );
    error.status = 401;
    return error;
  }
  const error = new Error(msg || 'Could not generate application kit');
  error.status = 500;
  return error;
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
    return getKit(userId, jobId);
  }

  const profile = await profileService.getOrCreate(userId);
  const canonical = resolveTailorOptions();
  const { supplementPages, tailorMode, highMatchTarget } = canonical;

  if (!(profile?.resumeText || '').trim() || profile.resumeText.trim().length < 50) {
    const err = new Error('Add your resume in Profile before generating a tailored application kit.');
    err.status = 400;
    throw err;
  }

  const job = options.job || (await findJob(userId, jobId));
  if (!job) {
    const err = new Error(
      `Job not found (${jobId}). Re-open it from Browse jobs or your queue, then try Generate kit again.`
    );
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

  const aiLive = await openaiService.isLive(userId);
  if (!aiLive) {
    const err = new Error(
      env.nodeEnv === 'production'
        ? 'Resume tailoring is temporarily unavailable. Please try again shortly.'
        : 'Add OPENAI_API_KEY on the server or your personal key in Profile → AI Integration before generating a tailored kit.'
    );
    err.status = env.nodeEnv === 'production' ? 503 : 400;
    throw err;
  }

  let kit;
  try {
    kit = await resumeTailorService.generateAdditiveKit({
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
  } catch (err) {
    throw formatKitGenerationError(err);
  }

  if (!kit?.tailored || !kit?.tailoredResumeText) {
    const err = new Error(
      'Tailoring returned an empty kit. Re-upload your resume in Profile, then try Generate kit again.'
    );
    err.status = 500;
    throw err;
  }

  // Fast first pass: one OpenAI call + structural repair (fits Render free-tier timeouts).
  // Queue → Polish until ready runs perfection + ATS boost for 95%+.
  kit = resumeTailorService.repairKitAgainstProfile(profile.resumeText, kit, jobDescription);
  kit = resumeTailorService.applyAtsMetadata(kit, jobDescription, job);

  const saved = await applicationKitStore.set(userId, jobId, {
    ...kit,
    pipelineVersion: KIT_PIPELINE_VERSION,
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

  if (options.recordActivity !== false) {
    await activityService.recordActivity({
      req: options.req,
      userId,
      type: 'generate_kit',
      entityType: 'job',
      entityId: jobId,
      summary: `Generated kit — ${job.title} · ${job.company}`,
      meta: {
        atsScore: saved?.atsScore ?? kit?.atsScore ?? null,
        company: job.company,
        title: job.title,
        tailorMode,
      },
    });
  }

  return saved;
}

async function polishUntilReady(userId, jobId, options = {}) {
  const { authEmail, tailorFocus: initialFocus } = options;
  const profile = await profileService.getOrCreate(userId);
  const canonical = resolveTailorOptions();
  const { highMatchTarget, supplementPages, tailorMode } = canonical;
  const polishMaxPasses = Math.min(
    POLISH_INTERACTIVE_MAX_PASSES,
    Math.max(1, Number(options.maxPasses) || POLISH_INTERACTIVE_MAX_PASSES)
  );

  if (!(await openaiService.isLive(userId))) {
    const err = new Error('OpenAI API key required — add your key in Profile → AI Integration.');
    err.status = 400;
    throw err;
  }

  const job = options.job || (await findJob(userId, jobId));
  if (!job) {
    const err = new Error('Job not found — re-open the posting from your queue or re-apply to refresh this role.');
    err.status = 404;
    throw err;
  }

  let kit = await applicationKitStore.get(userId, jobId);
  const passes = [];

  if (!kit?.tailored) {
    kit = await generateForJob(userId, jobId, {
      tailorResume: true,
      force: true,
      authEmail,
      highMatchTarget,
      supplementPages,
      tailorMode: 'high_match',
      tailorFocus: initialFocus || '',
      job,
      recordActivity: false,
    });
    passes.push({ round: 0, phase: 'generate', atsScore: kit.atsScore ?? null, jdMatchPct: kit.jdMatchPct ?? null });
    if (isKitReadyToApply({ tailored: true, hasKit: true, atsScore: kit.atsScore, useForApply: kit.useForApply !== false })) {
      const result = { kit, passes, ready: true };
      await activityService.recordActivity({
        req: options.req,
        userId,
        type: 'polish_kit',
        entityType: 'job',
        entityId: jobId,
        summary: `Polished kit — ATS ${kit.atsScore ?? '—'}%`,
        meta: { ready: true, passes: passes.length, atsScore: kit.atsScore ?? null, company: kit.company, title: kit.jobTitle },
      });
      return result;
    }
  }

  const jobDescription = await jobDescriptionService.resolveJobDescription(job);
  const contact = await applicantContactService.resolveApplicantContact(userId, profile, authEmail);
  let tailorFocus = initialFocus || kit.tailorFocus || '';
  const scored = resumeTailorService.applyAtsMetadata(kit, jobDescription, job);

  if (
    isKitReadyToApply({
      tailored: true,
      hasKit: true,
      atsScore: scored.atsScore,
      useForApply: scored.useForApply !== false,
    })
  ) {
    return { kit: scored, passes, ready: true };
  }

  const { getRedTerms } = require('./atsKeywordService');
  const focusParts = [
    ...(scored.uncoveredRequirements || []),
    ...getRedTerms(scored, 12),
  ].filter(Boolean);
  if (focusParts.length) tailorFocus = focusParts.slice(0, 12).join(', ');

  let polished;
  try {
    polished = await resumeTailorService.polishExistingKit({
      userId,
      profile,
      job,
      jobDescription,
      contact,
      kit: scored,
      tailorFocus,
      highMatchTarget: READY_ATS_MIN,
      maxPasses: polishMaxPasses,
    });
  } catch (err) {
    console.warn(`Polish failed for ${jobId}:`, err.message);
    const wrapped = new Error(err.message || 'AI polish request failed — try again in a moment.');
    wrapped.status = err.status || 502;
    throw wrapped;
  }

  kit = await applicationKitStore.set(userId, jobId, {
    ...polished,
    pipelineVersion: KIT_PIPELINE_VERSION,
    jobId,
    jobTitle: job.title,
    company: job.company,
    jobUrl: job.url,
    formatted: resumeTailorService.formatKitAsText(polished),
    generatedAt: new Date().toISOString(),
    useForApply: kit.useForApply !== false,
    tailorFocus,
    supplementPagesTarget: supplementPages,
    tailorMode: 'high_match',
    highMatchTarget,
  });

  passes.push({ round: 1, phase: 'refine', atsScore: kit.atsScore ?? null, jdMatchPct: kit.jdMatchPct ?? null });

  const result = {
    kit,
    passes,
    ready: isKitReadyToApply({
      tailored: true,
      hasKit: true,
      atsScore: kit.atsScore,
      useForApply: kit.useForApply !== false,
    }),
  };
  await activityService.recordActivity({
    req: options.req,
    userId,
    type: 'polish_kit',
    entityType: 'job',
    entityId: jobId,
    summary: `Polished kit — ATS ${kit.atsScore ?? '—'}%`,
    meta: {
      ready: result.ready,
      passes: passes.length,
      atsScore: kit.atsScore ?? null,
      company: kit.company,
      title: kit.jobTitle,
    },
  });
  return result;
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

  async function buildItem(job) {
    const jobId = job.jobId || job.id;
    let kit = await applicationKitStore.get(userId, jobId);
    let generationFailed = false;
    if (!kit?.tailored || kit.pipelineVersion !== KIT_PIPELINE_VERSION) {
      try {
        kit = await generateForJob(userId, jobId, {
          tailorResume: true,
          force: true,
          authEmail,
          job,
        });
      } catch (err) {
        console.warn(`Kit generation failed for ${jobId}:`, err.message);
        generationFailed = true;
      }
    }

    const useThisKit = Boolean(kit?.tailored && kit.useForApply !== false);
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
    const item = await attachKitToApplyItem(userId, applyBase, {
      useTailoredResume: useThisKit,
      contact,
      kit,
    });
    return { item, useThisKit, optedOut: Boolean(kit?.tailored && kit.useForApply === false), generationFailed };
  }

  const CONCURRENCY = 4;
  const items = [];
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const chunkResults = await Promise.all(jobs.slice(i, i + CONCURRENCY).map((job) => buildItem(job)));
    for (const result of chunkResults) {
      items.push(result.item);
      if (result.optedOut) optedOutCount += 1;
      else if (result.useThisKit) tailoredCount += 1;
      else if (result.generationFailed || !result.useThisKit) missingKitCount += 1;
    }
  }

  return { items, tailoredCount, missingKitCount, optedOutCount };
}

const backgroundKitRuns = new Map();

function schedulePrepareKits(userId, jobs, options = {}) {
  if (!userId || !jobs?.length) return null;
  const existing = backgroundKitRuns.get(userId);
  if (existing) {
    existing.catch(() => {});
    return existing;
  }
  const run = prepareApplyItems(userId, jobs, options)
    .then((result) => {
      console.log(
        `Background kits for ${userId}: ${result.tailoredCount} tailored, ${result.missingKitCount} missing`
      );
      return result;
    })
    .catch((err) => {
      console.warn(`Background kit generation failed for ${userId}:`, err.message);
      throw err;
    })
    .finally(() => {
      backgroundKitRuns.delete(userId);
    });
  backgroundKitRuns.set(userId, run);
  return run;
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

function kitListItem(kit, originalResume = '') {
  const display = kit?.tailored ? resumeTailorService.enrichKitForDisplay(kit, originalResume) : kit;
  return {
    jobId: display.jobId,
    jobTitle: display.jobTitle,
    company: display.company,
    jobUrl: display.jobUrl,
    pageCount: display.pageCount || display.supplementPages?.length || 0,
    supplementPagesTarget: display.supplementPagesTarget || display.pageCount || 4,
    tailorMode: display.tailorMode || 'high_match',
    highMatchTarget: display.highMatchTarget || 100,
    estimatedMatchPct: display.estimatedMatchPct || null,
    generatedAt: display.generatedAt,
    updatedAt: display.updatedAt,
    useForApply: display.useForApply !== false,
    tailorFocus: display.tailorFocus || '',
    contactEmail: display.contactEmail || '',
    demo: Boolean(display.demo),
    hasCoverLetter: Boolean(display.coverLetterParagraph),
    missingKeywords: (display.missingKeywords || []).slice(0, 8),
    tailored: Boolean(display.tailored),
    tailoredResumeText: display.tailoredResumeText || display.fullSupplementText || '',
    supplementPages: display.supplementPages || [],
    fullSupplementText: display.fullSupplementText || '',
    coverLetterParagraph: display.coverLetterParagraph || '',
    formatted: display.formatted || '',
    contactName: display.contactName || '',
    resumeStructure: display.resumeStructure || null,
    pipelineVersion: display.pipelineVersion || null,
    atsScore: display.atsScore ?? null,
    jdMatchPct: display.jdMatchPct ?? null,
  };
}

async function listKits(userId) {
  const [kits, profile] = await Promise.all([
    applicationKitStore.listForUser(userId),
    profileService.getOrCreate(userId),
  ]);
  const originalResume = profile?.resumeText || '';
  return kits.map((kit) => kitListItem(kit, originalResume));
}

async function setKitPreference(userId, jobId, { useForApply, tailorFocus }) {
  const canonical = resolveTailorOptions();
  const existing = await applicationKitStore.get(userId, jobId);
  if (!existing?.tailored) {
    const err = new Error('No tailored kit for this job yet. Generate one first.');
    err.status = 404;
    throw err;
  }
  const patch = {
    tailorMode: canonical.tailorMode,
    highMatchTarget: canonical.highMatchTarget,
    supplementPagesTarget: canonical.supplementPages,
  };
  if (useForApply !== undefined) patch.useForApply = Boolean(useForApply);
  if (tailorFocus !== undefined) patch.tailorFocus = String(tailorFocus).slice(0, 2000);
  return applicationKitStore.patchMeta(userId, jobId, patch);
}

async function kitSummary(userId, jobId) {
  const kit = await applicationKitStore.get(userId, jobId);
  const meta = await applicationMetaForJob(userId, jobId);
  const base = buildKitSummary(kit, meta.approvalStatus || meta.applicationStatus);
  if (!base.hasKit) return base;
  return {
    ...base,
    tailorFocus: kit.tailorFocus || '',
    ...meta,
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
  polishUntilReady,
  generateOnApprove,
  attachKitToApplyItem,
  prepareApplyItems,
  schedulePrepareKits,
  findJob,
  listKits,
  setKitPreference,
  kitSummary,
  applicationMetaForJob,
  getKitsForJobIds,
  kitListItem,
};
