const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const jobController = require('../controllers/jobController');

router.get('/', requireAuth, jobController.listJobs);
router.get('/boards/catalog', requireAuth, requireAdmin, jobController.boardCatalog);
router.get('/ingest/status', requireAuth, requireAdmin, jobController.ingestStatus);
router.post('/ingest', requireAuth, requireAdmin, jobController.ingestJobs);
router.post('/sync', requireAuth, jobController.syncJobs);
router.post('/import', requireAuth, jobController.importJobs);

module.exports = router;
