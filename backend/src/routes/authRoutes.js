const router = require('express').Router();
const authController = require('../controllers/authController');
const passkeyController = require('../controllers/passkeyController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPasswordWithToken);
router.post('/reset-password-code', authController.resetPasswordWithCode);
router.post('/passkey/login/options', passkeyController.loginOptions);
router.post('/passkey/login/verify', passkeyController.loginVerify);
router.get('/me', requireAuth, authController.me);
router.get('/passkey/status', requireAuth, passkeyController.status);
router.post('/passkey/register/options', requireAuth, passkeyController.registerOptions);
router.post('/passkey/register/verify', requireAuth, passkeyController.registerVerify);
router.delete('/passkey', requireAuth, passkeyController.remove);
router.post('/change-password', requireAuth, authController.changePassword);
router.post('/extension-token', requireAuth, authController.extensionToken);
router.get('/export-data', requireAuth, authController.exportData);
router.delete('/account', requireAuth, authController.deleteAccount);

module.exports = router;
