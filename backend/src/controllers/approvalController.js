const approvalService = require('../services/approvalService');

async function queueExternal(req, res, next) {
  try {
    const { url, title, company, source } = req.body;
    const notify = req.body.notify !== false;
    const item = await approvalService.addExternal(req.user.sub, { url, title, company, source, notify });
    res.status(item.isNew ? 201 : 200).json({
      message: item.isNew ? 'Added to Apply Queue' : 'Already in your queue',
      item,
    });
  } catch (err) {
    next(err);
  }
}

async function linkedinIngest(req, res, next) {
  try {
    const { jobs } = req.body;
    const notify = req.body.notify !== false;
    const result = await approvalService.ingestLinkedInJobs(req.user.sub, { jobs, notify });
    res.status(result.ingested ? 201 : 200).json({
      message:
        result.ingested > 0
          ? `${result.ingested} new LinkedIn job(s) queued — check your phone`
          : 'No new jobs (already queued)',
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

async function queueJob(req, res, next) {
  try {
    const { jobId, title, company, url, matchPct, atsType, source } = req.body;
    if (!jobId) return res.status(400).json({ message: 'jobId is required' });
    const item = await approvalService.queueJob(req.user.sub, {
      jobId,
      title,
      company,
      url,
      matchPct,
      atsType,
      source,
      notify: req.body.notify !== false,
    });
    res.status(item.isNew ? 201 : 200).json({
      message: item.isNew ? 'Added to apply queue' : 'Already in your queue',
      item,
    });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const result = await approvalService.listForUser(req.user.sub, {
      status: req.query.status || 'pending',
      search: req.query.search || '',
      minMatch: req.query.minMatch || '',
      minCallback: req.query.minCallback || '',
      ats: req.query.ats || '',
      sort: req.query.sort || 'match',
      limit: req.query.limit || 0,
      offset: req.query.offset || 0,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function summary(req, res, next) {
  try {
    const counts = await approvalService.counts(req.user.sub);
    res.json(counts);
  } catch (err) {
    next(err);
  }
}

async function approve(req, res, next) {
  try {
    const item = await approvalService.setStatus(req.user.sub, req.params.jobId, 'approved', req.body.notes, {
      tailorResume: req.body.tailorResume,
      authEmail: req.user.email,
      req,
    });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

async function reject(req, res, next) {
  try {
    const item = await approvalService.setStatus(req.user.sub, req.params.jobId, 'rejected', req.body.notes, { req });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

async function bulkApprove(req, res, next) {
  try {
    const { jobIds } = req.body;
    if (!Array.isArray(jobIds) || !jobIds.length) {
      return res.status(400).json({ message: 'jobIds array required' });
    }
    const results = await approvalService.bulkSetStatus(req.user.sub, jobIds, 'approved', {
      tailorResume: req.body.tailorResume,
      authEmail: req.user.email,
      skipKitGeneration: Boolean(req.body.skipKitGeneration),
      req,
    });
    res.json({ count: results.length, message: `Approved ${results.length} job(s)` });
  } catch (err) {
    next(err);
  }
}

async function bulkReject(req, res, next) {
  try {
    const { jobIds } = req.body;
    if (!Array.isArray(jobIds) || !jobIds.length) {
      return res.status(400).json({ message: 'jobIds array required' });
    }
    const results = await approvalService.bulkSetStatus(req.user.sub, jobIds, 'rejected', { req });
    res.json({ count: results.length, message: `Skipped ${results.length} job(s)` });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, summary, approve, reject, queueExternal, queueJob, linkedinIngest, bulkApprove, bulkReject };
