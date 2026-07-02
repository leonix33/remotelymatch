const router = require('express').Router();
const { requireAuth } = require('../middleware/authMiddleware');
const applicationController = require('../controllers/applicationController');
const applicationKitController = require('../controllers/applicationKitController');

router.get('/', requireAuth, applicationController.listApplications);
router.get('/activity', requireAuth, applicationController.myActivity);
router.post('/import', requireAuth, applicationController.importApplications);
router.get('/kits', requireAuth, applicationKitController.listKits);
router.get('/kit/:jobId', requireAuth, applicationKitController.getKit);
router.post('/kit/:jobId/generate', requireAuth, applicationKitController.generateKit);
router.post('/kit/:jobId/polish', requireAuth, applicationKitController.polishKit);
router.post('/:jobId/reapply', requireAuth, applicationController.reapply);
router.patch('/kit/:jobId/preference', requireAuth, applicationKitController.updatePreference);
router.get('/kit/:jobId/ats-score', requireAuth, applicationKitController.atsScore);

module.exports = router;
