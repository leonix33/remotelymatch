const router = require('express').Router();
const { requireAuth } = require('../middleware/authMiddleware');
const approvalController = require('../controllers/approvalController');

router.get('/', requireAuth, approvalController.list);
router.get('/summary', requireAuth, approvalController.summary);
router.post('/bulk-approve', requireAuth, approvalController.bulkApprove);
router.post('/bulk-reject', requireAuth, approvalController.bulkReject);
router.post('/queue-external', requireAuth, approvalController.queueExternal);
router.post('/:jobId/approve', requireAuth, approvalController.approve);
router.post('/:jobId/reject', requireAuth, approvalController.reject);

module.exports = router;
