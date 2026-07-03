const router = require('express').Router();
const { requireAuth } = require('../middleware/authMiddleware');
const activityController = require('../controllers/activityController');

router.post('/page-view', requireAuth, activityController.pageView);

module.exports = router;
