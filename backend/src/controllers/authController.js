const { z } = require('zod');
const authService = require('../services/authService');
const activityService = require('../services/activityService');
const userDataService = require('../services/userDataService');
const emailService = require('../services/emailService');
const env = require('../config/env');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8),
});

const resetPasswordCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(6),
  newPassword: z.string().min(8),
});

async function login(req, res, next) {
  const body = loginSchema.safeParse(req.body);
  if (!body.success) return next(body.error);
  const email = body.data.email;
  try {
    const result = await authService.login(email, body.data.password);
    await activityService.recordLogin({
      req,
      email,
      user: result.user,
      method: 'password',
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
      method: 'password',
      success: false,
      reason: err.message || 'Login failed',
    });
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await authService.getMe(req.user.sub);
    await activityService.touchUserSeen(req.user.sub);
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const body = changePasswordSchema.parse(req.body);
    await authService.changePassword(req.user.sub, body.currentPassword, body.newPassword);
    res.json({ message: 'Password updated' });
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const result = await authService.requestPasswordReset(email);
    if (result.reason === 'no_database') {
      return res.status(503).json({
        message: 'Password reset requires MongoDB. Contact your admin.',
        emailSent: false,
      });
    }
    if (result.user && result.resetUrl && result.code) {
      const emailResult = await emailService.notifyForgotPassword({
        to: result.user.email,
        name: result.user.name,
        resetUrl: result.resetUrl,
        code: result.code,
      });
      if (!emailResult.sent) {
        console.error('Forgot-password email failed:', emailResult.reason);
        if (env.nodeEnv !== 'production') {
          console.log('\n[dev] Password reset code:', result.code, '\nLink:', result.resetUrl, '\n');
          return res.json({
            message: 'Email not configured locally. Use the reset code shown in the server terminal.',
            emailSent: false,
            devResetCode: result.code,
          });
        }
        return res.status(503).json({
          message:
            emailResult.reason ||
            'We found your account but could not send the reset email. Try again in a minute.',
          emailSent: false,
        });
      }
      return res.json({
        message: 'Reset code sent! Check your inbox and spam folder, then enter the 6-digit code below.',
        emailSent: true,
        codeExpiresMinutes: result.codeExpiresMinutes || 15,
      });
    }
    res.json({
      message: 'If that email has an account, we sent a reset code. Check your inbox and spam folder.',
      emailSent: null,
    });
  } catch (err) {
    next(err);
  }
}

async function resetPasswordWithCode(req, res, next) {
  try {
    const body = resetPasswordCodeSchema.parse(req.body);
    const result = await authService.completePasswordResetWithCode(
      body.email,
      body.code,
      body.newPassword
    );
    res.json({
      message: 'Password updated. You can sign in now.',
      email: result.email,
    });
  } catch (err) {
    if (!err.status) err.status = 400;
    next(err);
  }
}

async function resetPasswordWithToken(req, res, next) {
  try {
    const body = resetPasswordSchema.parse(req.body);
    const result = await authService.completePasswordReset(body.token, body.newPassword);
    res.json({
      message: 'Password updated. You can sign in now.',
      email: result.email,
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      err.status = 400;
      err.message = 'Reset link expired or invalid. Request a new one from the login page.';
    }
    next(err);
  }
}

async function extensionToken(req, res, next) {
  try {
    const user = await authService.getMe(req.user.sub);
    const token = authService.signExtensionToken(user);
    res.json({
      apiUrl: env.appUrl,
      accessToken: token,
      expiresIn: '90 days',
      instructions: 'Paste both values into the Chrome extension Settings page.',
    });
  } catch (err) {
    next(err);
  }
}

async function exportData(req, res, next) {
  try {
    const data = await userDataService.exportUserData(req.user.sub);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="remotelymatch-data-export.json"');
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function deleteAccount(req, res, next) {
  try {
    const body = z.object({ password: z.string().min(8) }).parse(req.body);
    const result = await userDataService.deleteUserAccount(req.user.sub, body.password);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  me,
  changePassword,
  forgotPassword,
  resetPasswordWithToken,
  resetPasswordWithCode,
  extensionToken,
  exportData,
  deleteAccount,
};
