const router = require('express').Router();
const { requireAuth } = require('../middleware/authMiddleware');
const calendarController = require('../controllers/calendarController');

router.get('/', requireAuth, calendarController.list);
router.get('/upcoming', requireAuth, calendarController.upcoming);
router.post('/', requireAuth, calendarController.create);
router.patch('/:id', requireAuth, calendarController.update);
router.delete('/:id', requireAuth, calendarController.remove);

module.exports = router;
