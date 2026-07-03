const activityService = require('../services/activityService');
const env = require('../config/env');

async function dashboard(req, res, next) {
  try {
    const days = Number(req.query.days) || 7;
    const limit = Number(req.query.limit) || 80;
    const payload = await activityService.getObservabilityDashboard({ days, limit });
    res.json(payload);
  } catch (err) {
    console.error('GET /api/admin/observability failed:', err);
    res.status(500).json({
      message: err.message || 'Observability dashboard failed',
      mongoRequired: !env.mongoUri,
    });
  }
}

module.exports = { dashboard };
