const router = require('express').Router();
const { requireAuth, requireAdminFresh } = require('../middleware/authMiddleware');
const { requireMongo } = require('../middleware/mongoMiddleware');
const userController = require('../controllers/userController');

router.get('/', requireAuth, requireAdminFresh, requireMongo, userController.listUsers);
router.post('/', requireAuth, requireAdminFresh, requireMongo, userController.createUser);
router.patch('/:id', requireAuth, requireAdminFresh, requireMongo, userController.updateUser);
router.delete('/:id', requireAuth, requireAdminFresh, requireMongo, userController.deleteUser);
router.post('/:id/reset-password', requireAuth, requireAdminFresh, requireMongo, userController.resetPassword);

module.exports = router;
