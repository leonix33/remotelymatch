const analyticsService = require('../services/analyticsService');
const { isAdminRole } = require('../utils/roles');

async function summary(req, res, next) {
  try {
    const userId = isAdminRole(req.user.role) ? null : req.user.sub;
    const data = await analyticsService.summary(userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { summary };
