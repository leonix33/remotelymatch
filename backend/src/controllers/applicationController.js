const applicationService = require('../services/applicationService');
const env = require('../config/env');

async function listApplications(req, res, next) {
  try {
    const apps = await applicationService.listForUser(req.user.sub, {
      status: req.query.status || '',
      limit: req.query.limit || 500,
      offset: req.query.offset || 0,
    });
    res.json(apps);
  } catch (err) {
    next(err);
  }
}

async function myActivity(req, res, next) {
  try {
    const activity = await applicationService.activityForUser(req.user.sub);
    res.json(activity);
  } catch (err) {
    next(err);
  }
}

async function importApplications(req, res, next) {
  try {
    if (!env.mongoUri) {
      return res.status(400).json({ message: 'MongoDB is required for import' });
    }
    const applications = req.body.applications;
    if (!Array.isArray(applications) || !applications.length) {
      return res.status(400).json({ message: 'applications array is required' });
    }
    let imported = 0;
    const notifyBatch = [];
    for (const app of applications) {
      if (!app.jobId) continue;
      await applicationService.upsertForUser(req.user.sub, app.jobId, app);
      imported += 1;
      if (['submitted', 'queued'].includes(app.status) || app.submittedAt) {
        notifyBatch.push(app);
      }
    }

    let emailNotification = null;
    if (notifyBatch.length) {
      try {
        const tractionService = require('../services/tractionService');
        emailNotification = await tractionService.sendPostApplyFeedback(req.user.sub, notifyBatch, {
          authEmail: req.user.email,
          queued: notifyBatch.some((a) => a.status === 'queued'),
          status: notifyBatch[0]?.status || 'submitted',
        });
      } catch (err) {
        console.warn('Import apply email failed:', err.message);
        emailNotification = { sent: false, reason: err.message };
      }
    }

    res.json({ imported, emailNotification });
  } catch (err) {
    next(err);
  }
}

async function reapply(req, res, next) {
  try {
    const result = await applicationService.reapplyForJob(req.user.sub, req.params.jobId, {
      authEmail: req.user.email,
      useTailoredResume: req.body?.useTailoredResume !== false,
    });
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
}

module.exports = { listApplications, myActivity, importApplications, reapply };
