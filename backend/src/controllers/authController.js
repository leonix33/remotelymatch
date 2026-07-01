const { z } = require('zod');
const authService = require('../services/authService');
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

async function login(req, res, next) {
  try {
    const body = loginSchema.parse(req.body);
    const result = await authService.login(body.email, body.password);
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
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await authService.getMe(req.user.sub);
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
    if (result.user && result.resetUrl) {
      const emailResult = await emailService.notifyForgotPassword({
        to: result.user.email,
        name: result.user.name,
        resetUrl: result.resetUrl,
      });
      if (!emailResult.sent) {
        console.error('Forgot-password email failed:', emailResult.reason);
        if (env.nodeEnv !== 'production') {
          console.log('\n[dev] Password reset link (email not configured locally):\n', result.resetUrl, '\n');
          return res.status(503).json({
            message:
              'Email is not configured for local dev. Check the terminal running npm run dev for a reset link, or sign in with ADMIN_PASSWORD from backend/.env.',
            emailSent: false,
            devResetAvailable: true,
          });
        }
        return res.status(503).json({
          message:
            'We found your account but could not send the reset email. Try again in a minute, or sign in with your Render admin password if you have access.',
          emailSent: false,
        });
      }
      return res.json({
        message: 'Reset link sent! Check your inbox and spam folder for an email from remotelymatch.',
        emailSent: true,
      });
    }
    res.json({
      message: 'If that email has an account, we sent a reset link. Check your inbox and spam folder.',
      emailSent: null,
    });
  } catch (err) {
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
  extensionToken,
  exportData,
  deleteAccount,
};
