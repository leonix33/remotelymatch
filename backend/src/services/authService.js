const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const PasswordResetCode = require('../models/PasswordResetCode');
const env = require('../config/env');

function signAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, email: user.email, name: user.name },
    env.jwtAccessSecret,
    { expiresIn: '7d' }
  );
}

function signExtensionToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, email: user.email, name: user.name, type: 'extension' },
    env.jwtAccessSecret,
    { expiresIn: '90d' }
  );
}

function signPasswordResetToken(email) {
  return jwt.sign(
    { email: email.trim().toLowerCase(), purpose: 'pwd-reset' },
    env.jwtRefreshSecret,
    { expiresIn: '1h' }
  );
}

function verifyPasswordResetToken(token) {
  const payload = jwt.verify(token, env.jwtRefreshSecret);
  if (payload.purpose !== 'pwd-reset' || !payload.email) {
    const err = new Error('Invalid or expired reset link');
    err.status = 400;
    throw err;
  }
  return payload.email;
}

function isEnvAdminLogin(email, password) {
  return (
    env.adminEmail &&
    env.adminPassword &&
    email === env.adminEmail.toLowerCase() &&
    password === env.adminPassword
  );
}

async function loginWithEnvAdmin(email) {
  if (env.mongoUri) {
    let user = await User.findOne({ email });
    const passwordHash = await bcrypt.hash(env.adminPassword, 10);
    if (!user) {
      user = await User.create({
        name: 'Admin',
        email,
        role: 'admin',
        passwordHash,
      });
    } else {
      user.passwordHash = passwordHash;
      user.role = 'admin';
      user.active = true;
      await user.save();
    }
    return { user, accessToken: signAccessToken(user) };
  }
  const devUser = {
    _id: 'dev-admin',
    name: 'Admin',
    email: env.adminEmail,
    role: 'admin',
  };
  return { user: devUser, accessToken: signAccessToken(devUser) };
}

async function login(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.trim();

  if (!normalizedPassword) {
    const err = new Error('Password is required');
    err.status = 400;
    throw err;
  }

  if (env.mongoUri) {
    const user = await User.findOne({ email: normalizedEmail });
    if (user) {
      if (!user.active) {
        const err = new Error('This account is disabled. Ask your admin to re-enable it under Team access.');
        err.status = 403;
        throw err;
      }
      const ok = await bcrypt.compare(normalizedPassword, user.passwordHash);
      if (ok) {
        return { user, accessToken: signAccessToken(user) };
      }
      if (isEnvAdminLogin(normalizedEmail, normalizedPassword)) {
        return loginWithEnvAdmin(normalizedEmail);
      }
      const err = new Error(
        'Wrong email or password. Use Forgot password below, or your original invite password if you have not reset yet.'
      );
      err.status = 401;
      throw err;
    }
    if (isEnvAdminLogin(normalizedEmail, normalizedPassword)) {
      return loginWithEnvAdmin(normalizedEmail);
    }
    throw new Error('Invalid login');
  }

  if (isEnvAdminLogin(normalizedEmail, normalizedPassword)) {
    return loginWithEnvAdmin(normalizedEmail);
  }

  throw new Error('Invalid login');
}

async function getMe(userId) {
  if (userId === 'dev-admin') {
    if (!env.mongoUri) {
      return { _id: 'dev-admin', name: 'Admin', email: env.adminEmail, role: 'admin' };
    }
    const admin = await User.findOne({
      email: env.adminEmail?.toLowerCase(),
      role: 'admin',
      active: true,
    }).select('-passwordHash');
    if (!admin) throw new Error('User not found');
    return admin;
  }
  const user = await User.findById(userId).select('-passwordHash');
  if (!user) throw new Error('User not found');
  return user;
}

async function changePassword(userId, currentPassword, newPassword) {
  if (!env.mongoUri) throw new Error('MongoDB is required to change password');
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  const current = String(currentPassword || '').trim();
  const next = String(newPassword || '').trim();
  if (next.length < 8) {
    const err = new Error('Password must be at least 8 characters');
    err.status = 400;
    throw err;
  }
  let ok = await bcrypt.compare(current, user.passwordHash);
  if (!ok && isEnvAdminLogin(user.email, current)) {
    ok = true;
  }
  if (!ok) throw new Error('Current password is incorrect');
  user.passwordHash = await bcrypt.hash(next, 10);
  await user.save();
}

async function resetPassword(targetUserId, newPassword) {
  if (!env.mongoUri) throw new Error('MongoDB is required to reset password');
  const clean = String(newPassword || '').trim();
  if (clean.length < 8) {
    const err = new Error('Password must be at least 8 characters');
    err.status = 400;
    throw err;
  }
  const user = await User.findById(targetUserId);
  if (!user) throw new Error('User not found');
  user.passwordHash = await bcrypt.hash(clean, 10);
  user.active = true;
  await user.save();
  return { id: user._id, email: user.email, name: user.name };
}

async function requestPasswordReset(email) {
  if (!env.mongoUri) {
    return { sent: false, reason: 'no_database' };
  }
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail, active: true });
  if (!user) {
    return { sent: true, reason: 'unknown_email' };
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await PasswordResetCode.deleteMany({ email: normalizedEmail });
  await PasswordResetCode.create({ email: normalizedEmail, codeHash, expiresAt });
  const token = signPasswordResetToken(normalizedEmail);
  const resetUrl = `${env.appUrl.replace(/\/$/, '')}/login?reset=${encodeURIComponent(token)}`;
  return { sent: true, user, token, resetUrl, code, codeExpiresMinutes: 15 };
}

async function completePasswordResetWithCode(email, code, newPassword) {
  if (!env.mongoUri) throw new Error('MongoDB is required to reset password');
  const normalizedEmail = email.trim().toLowerCase();
  const cleanCode = String(code || '').trim();
  const clean = String(newPassword || '').trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    const err = new Error('Enter the 6-digit code from your email');
    err.status = 400;
    throw err;
  }
  if (clean.length < 8) {
    const err = new Error('Password must be at least 8 characters');
    err.status = 400;
    throw err;
  }
  const record = await PasswordResetCode.findOne({
    email: normalizedEmail,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
  if (!record) {
    const err = new Error('Reset code expired or not found. Request a new code.');
    err.status = 400;
    throw err;
  }
  const codeOk = await bcrypt.compare(cleanCode, record.codeHash);
  if (!codeOk) {
    const err = new Error('Incorrect reset code. Check your email and try again.');
    err.status = 400;
    throw err;
  }
  const user = await User.findOne({ email: normalizedEmail, active: true });
  if (!user) {
    const err = new Error('Account not found');
    err.status = 404;
    throw err;
  }
  user.passwordHash = await bcrypt.hash(clean, 10);
  await user.save();
  record.usedAt = new Date();
  await record.save();
  return { email: user.email, name: user.name };
}

async function completePasswordReset(token, newPassword) {
  if (!env.mongoUri) throw new Error('MongoDB is required to reset password');
  const email = verifyPasswordResetToken(token);
  const clean = String(newPassword || '').trim();
  if (clean.length < 8) {
    const err = new Error('Password must be at least 8 characters');
    err.status = 400;
    throw err;
  }
  const user = await User.findOne({ email, active: true });
  if (!user) {
    const err = new Error('Account not found');
    err.status = 404;
    throw err;
  }
  user.passwordHash = await bcrypt.hash(clean, 10);
  await user.save();
  return { email: user.email, name: user.name };
}

module.exports = {
  login,
  signAccessToken,
  signExtensionToken,
  signPasswordResetToken,
  getMe,
  changePassword,
  resetPassword,
  requestPasswordReset,
  completePasswordReset,
  completePasswordResetWithCode,
};
