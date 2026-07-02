const router = require('express').Router();
const { requireAuth } = require('../middleware/authMiddleware');
const tractionController = require('../controllers/tractionController');

router.get('/trace', requireAuth, tractionController.trace);
router.get('/digest/preview', requireAuth, tractionController.previewDigest);
router.post('/digest/send', requireAuth, tractionController.sendDigest);
router.post('/scan', requireAuth, tractionController.scan);
router.get('/follow-up/board', requireAuth, tractionController.followUpBoard);
router.get('/follow-up/:jobId/kit', requireAuth, tractionController.followUpKit);
router.post('/follow-up/:jobId/enrich', requireAuth, tractionController.enrichFollowUp);
router.post('/follow-up/:jobId/send', requireAuth, tractionController.sendFollowUp);
router.post('/follow-up/:jobId/done', requireAuth, tractionController.markDone);
router.post('/enrichment/test', requireAuth, tractionController.enrichmentTest);

module.exports = router;
