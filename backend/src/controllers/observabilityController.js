const activityService = require('../services/activityService');

async function dashboard(req, res, next) {
  try {
    const days = Number(req.query.days) || 7;
    const limit = Number(req.query.limit) || 80;
    res.json(await activityService.getObservabilityDashboard({ days, limit }));
  } catch (err) {
    next(err);
  }
}

module.exports = { dashboard };
