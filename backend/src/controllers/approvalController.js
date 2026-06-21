const approvalService = require('../services/approvalService');

async function queueExternal(req, res, next) {
  try {
    const { url, title, company } = req.body;
    const item = await approvalService.addExternal(req.user.sub, { url, title, company });
    res.status(201).json({ message: 'Added to Apply Queue', item });
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
    const item = await approvalService.setStatus(req.user.sub, req.params.jobId, 'approved', req.body.notes);
    res.json(item);
  } catch (err) {
    next(err);
  }
}

async function reject(req, res, next) {
  try {
    const item = await approvalService.setStatus(req.user.sub, req.params.jobId, 'rejected', req.body.notes);
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
    const results = await approvalService.bulkSetStatus(req.user.sub, jobIds, 'approved');
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
    const results = await approvalService.bulkSetStatus(req.user.sub, jobIds, 'rejected');
    res.json({ count: results.length, message: `Skipped ${results.length} job(s)` });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, summary, approve, reject, queueExternal, bulkApprove, bulkReject };
