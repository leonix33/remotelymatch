const tractionService = require('../services/tractionService');
const contactEnrichmentService = require('../services/contactEnrichmentService');
const followUpDraftService = require('../services/followUpDraftService');
const followUpSendService = require('../services/followUpSendService');

async function trace(req, res, next) {
  try {
    const data = await tractionService.buildTractionTrace(req.user.sub);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function previewDigest(req, res, next) {
  try {
    res.json(await tractionService.previewDigest(req.user.sub, req.user.email));
  } catch (err) {
    next(err);
  }
}

async function sendDigest(req, res, next) {
  try {
    const result = await tractionService.sendAppliedDigestEmail(req.user.sub, req.user.email);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function scan(req, res, next) {
  try {
    const result = await tractionService.scanAndNotifyTraction(req.user.sub);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function markDone(req, res, next) {
  try {
    const { notes } = req.body || {};
    const result = await tractionService.markFollowUpDone(req.user.sub, req.params.jobId, notes);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function followUpKit(req, res, next) {
  try {
    const kit = await followUpDraftService.getOrGenerate(req.user.sub, req.params.jobId, {
      authEmail: req.user.email,
      force: req.query.regenerate === '1',
      req,
    });
    res.json(kit);
  } catch (err) {
    next(err);
  }
}

async function followUpBoard(req, res, next) {
  try {
    const board = await tractionService.buildFollowUpBoard(req.user.sub, req.user.email);
    res.json(board);
  } catch (err) {
    next(err);
  }
}

async function enrichFollowUp(req, res, next) {
  try {
    const kit = await followUpDraftService.getOrGenerate(req.user.sub, req.params.jobId, {
      authEmail: req.user.email,
      force: true,
      req,
    });
    res.json(kit);
  } catch (err) {
    next(err);
  }
}

async function sendFollowUp(req, res, next) {
  try {
    const { recipientEmail, recipientName } = req.body || {};
    const result = await followUpSendService.sendFollowUpOutreach(req.user.sub, req.params.jobId, {
      authEmail: req.user.email,
      recipientEmail: recipientEmail ? String(recipientEmail).trim() : '',
      recipientName: recipientName ? String(recipientName).trim() : '',
      req,
    });
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    next(err);
  }
}

async function enrichmentTest(req, res, next) {
  try {
    const domain = String(req.body?.domain || req.query?.domain || 'stripe.com').trim();
    const company = String(req.body?.company || req.query?.company || 'Stripe').trim();
    const result = await contactEnrichmentService.testEnrichmentProviders(req.user.sub, { domain, company });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { trace, previewDigest, sendDigest, scan, markDone, followUpKit, followUpBoard, enrichFollowUp, sendFollowUp, enrichmentTest };
