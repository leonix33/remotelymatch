const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const setupController = require('../controllers/setupController');

router.get('/status', requireAuth, setupController.status);
router.post('/adzuna', requireAuth, requireAdmin, setupController.saveAdzuna);

module.exports = router;
