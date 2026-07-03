const { z } = require('zod');
const passkeyService = require('../services/passkeyService');
const authService = require('../services/authService');
const activityService = require('../services/activityService');

const emailSchema = z.object({
  email: z.string().email(),
});

async function status(req, res, next) {
  try {
    const passkeys = await passkeyService.listPasskeys(req.user.sub);
    res.json({
      enabled: passkeys.length > 0,
      passkeys,
    });
  } catch (err) {
    next(err);
  }
}

async function registerOptions(req, res, next) {
  try {
    const options = await passkeyService.registrationOptions(req, req.user);
    res.json(options);
  } catch (err) {
    next(err);
  }
}

async function registerVerify(req, res, next) {
  try {
    const attestation = { ...req.body };
    const deviceLabel = typeof attestation.deviceLabel === 'string' ? attestation.deviceLabel : '';
    delete attestation.deviceLabel;
    const result = await passkeyService.verifyRegistration(req, req.user, attestation, deviceLabel);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function loginOptions(req, res, next) {
  try {
    const { email } = emailSchema.parse(req.body);
    const options = await passkeyService.loginOptions(req, email);
    res.json(options);
  } catch (err) {
    next(err);
  }
}

async function loginVerify(req, res, next) {
  const payload = { ...req.body };
  const email = payload.email;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ message: 'Email is required' });
  }
  delete payload.email;
  try {
    const result = await passkeyService.verifyLogin(req, email, payload);
    await activityService.recordLogin({
      req,
      email,
      user: result.user,
      method: 'passkey',
      success: true,
    });
    res.json({
      accessToken: result.accessToken,
      user: {
        id: result.user._id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
      },
    });
  } catch (err) {
    await activityService.recordLogin({
      req,
      email,
      method: 'passkey',
      success: false,
      reason: err.message || 'Passkey login failed',
    });
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const result = await passkeyService.removePasskeys(req.user.sub);
    res.json({ message: 'Face ID sign-in removed', ...result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  status,
  registerOptions,
  registerVerify,
  loginOptions,
  loginVerify,
  remove,
};
