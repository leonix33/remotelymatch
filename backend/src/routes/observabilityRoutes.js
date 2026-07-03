const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const observabilityController = require('../controllers/observabilityController');

router.get('/', requireAuth, requireAdmin, observabilityController.dashboard);

module.exports = router;
