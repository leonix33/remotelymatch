const activityService = require('../services/activityService');

async function pageView(req, res, next) {
  try {
    const path = String(req.body?.path || req.query?.path || '').slice(0, 300);
    const name = String(req.body?.name || req.query?.name || '').slice(0, 120);
    if (!path) {
      return res.status(400).json({ message: 'path is required' });
    }
    await activityService.recordActivity({
      req,
      userId: req.user.sub,
      email: req.user.email,
      type: 'page_view',
      entityType: 'route',
      entityId: path,
      summary: name ? `Viewed ${name}` : `Viewed ${path}`,
      meta: { path, name },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { pageView };
