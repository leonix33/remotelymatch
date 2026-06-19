const router = require('express').Router();
const { requireAuth } = require('../middleware/authMiddleware');
const resumeCommunityController = require('../controllers/resumeCommunityController');

router.get('/', requireAuth, resumeCommunityController.list);
router.get('/mine', requireAuth, resumeCommunityController.mine);
router.post('/import-profile', requireAuth, resumeCommunityController.importProfile);
router.get('/:id', requireAuth, resumeCommunityController.getOne);
router.post('/', requireAuth, resumeCommunityController.create);
router.patch('/:id', requireAuth, resumeCommunityController.update);
router.delete('/:id', requireAuth, resumeCommunityController.remove);
router.post('/:id/copy', requireAuth, resumeCommunityController.copy);

module.exports = router;
