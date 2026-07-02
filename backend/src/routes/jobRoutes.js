const router = require('express').Router();
const { requireAuth } = require('../middleware/authMiddleware');
const jobController = require('../controllers/jobController');

router.get('/', requireAuth, jobController.listJobs);
router.get('/boards/catalog', requireAuth, jobController.boardCatalog);
router.get('/ingest/status', requireAuth, jobController.ingestStatus);
router.post('/ingest', requireAuth, jobController.ingestJobs);
router.post('/sync', requireAuth, jobController.syncJobs);
router.post('/import', requireAuth, jobController.importJobs);

module.exports = router;
