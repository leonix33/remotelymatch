const applicationKitService = require('../services/applicationKitService');

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
    });
    res.json(kit);
  } catch (err) {
    next(err);
  }
}

module.exports = { listKits, getKit, generateKit, updatePreference };
