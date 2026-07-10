const applicationKitService = require('../services/applicationKitService');
const atsKeywordService = require('../services/atsKeywordService');
const profileService = require('../services/profileService');
const jobDescriptionService = require('../services/jobDescriptionService');
const applicationKitStore = require('../services/applicationKitStore');
const jobService = require('../services/jobService');

async function listKits(req, res, next) {
  try {
    res.json(await applicationKitService.listKits(req.user.sub));
  } catch (err) {
    next(err);
  }
}

async function getKit(req, res, next) {
  try {
    const kit = await applicationKitService.getKit(req.user.sub, req.params.jobId);
    if (!kit) {
      return res.status(404).json({ message: 'No application kit yet. Generate one from the apply queue or jobs page.' });
    }
    res.json({
      ...kit,
      ...(await applicationKitService.applicationMetaForJob(req.user.sub, req.params.jobId)),
    });
  } catch (err) {
    next(err);
  }
}

async function updatePreference(req, res, next) {
  try {
    const kit = await applicationKitService.setKitPreference(req.user.sub, req.params.jobId, {
      useForApply: req.body?.useForApply,
      tailorFocus: req.body?.tailorFocus,
      supplementPages: req.body?.supplementPages,
      tailorMode: req.body?.tailorMode,
      highMatchTarget: req.body?.highMatchTarget,
    });
    res.json(kit);
  } catch (err) {
    next(err);
  }
}

async function generateKit(req, res, next) {
  try {
    const tailorResume = req.body?.tailorResume !== false;
    const kit = await applicationKitService.generateForJob(req.user.sub, req.params.jobId, {
      tailorResume,
      force: Boolean(req.body?.force),
      authEmail: req.user.email,
      tailorFocus: req.body?.tailorFocus || req.body?.retailorNotes || '',
      supplementPages: req.body?.supplementPages,
      tailorMode: req.body?.tailorMode,
      highMatchTarget: req.body?.highMatchTarget,
      req,
    });
    res.json(kit);
  } catch (err) {
    next(err);
  }
}

async function polishKit(req, res, next) {
  try {
    const result = await applicationKitService.polishUntilReady(req.user.sub, req.params.jobId, {
      authEmail: req.user.email,
      highMatchTarget: req.body?.highMatchTarget,
      supplementPages: req.body?.supplementPages,
      tailorFocus: req.body?.tailorFocus || '',
      maxRounds: req.body?.maxRounds,
      req,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function atsScore(req, res, next) {
  try {
    const jobId = req.params.jobId;
    const profile = await profileService.getOrCreate(req.user.sub);
    const kit = await applicationKitStore.get(req.user.sub, jobId);
    const job =
      jobService.readJobsFromSqlite(5000).find((j) => j.jobId === jobId) ||
      (kit ? { jobId, title: kit.jobTitle, company: kit.company, url: kit.jobUrl } : { jobId });
    const jd = await jobDescriptionService.resolveJobDescription(job);
    const ats = atsKeywordService.scoreAtsKeywords({
      resumeText: profile.resumeText,
      tailoredText: kit?.tailoredResumeText,
      jobDescription: jd,
      job,
    });
    res.json({ jobId, ...ats });
  } catch (err) {
    next(err);
  }
}

async function kitCompare(req, res, next) {
  try {
    const jobId = req.params.jobId;
    const kit = await applicationKitStore.get(req.user.sub, jobId);
    const job =
      (await applicationKitService.findJob(req.user.sub, jobId)) ||
      jobService.readJobsFromSqlite(5000).find((j) => j.jobId === jobId) ||
      (kit ? { jobId, title: kit.jobTitle, company: kit.company, url: kit.jobUrl } : { jobId });
    const jobDescription = await jobDescriptionService.resolveJobDescription(job);
    const tailoredResumeText =
      kit?.tailoredResumeText || kit?.fullSupplementText || kit?.resumeAddendum || '';
    const ats = atsKeywordService.scoreAtsKeywords({
      tailoredText: tailoredResumeText,
      jobDescription,
      job,
    });
    res.json({
      jobId,
      jobTitle: kit?.jobTitle || job?.title || '',
      company: kit?.company || job?.company || '',
      hasKit: Boolean(kit?.tailored && tailoredResumeText),
      jobDescription,
      tailoredResumeText,
      atsScore: kit?.atsScore ?? ats.score,
      ...ats,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listKits, getKit, generateKit, polishKit, updatePreference, atsScore, kitCompare };
