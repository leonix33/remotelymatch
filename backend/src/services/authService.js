const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
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

async function login(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.trim();

  if (!normalizedPassword) {
    const err = new Error('Password is required');
    err.status = 400;
    throw err;
  }

  // Always honor ADMIN_EMAIL / ADMIN_PASSWORD from environment (Render dashboard)
  if (
    env.adminEmail &&
    env.adminPassword &&
    normalizedEmail === env.adminEmail.toLowerCase() &&
    normalizedPassword === env.adminPassword
  ) {
    if (env.mongoUri) {
      let user = await User.findOne({ email: normalizedEmail });
      const passwordHash = await bcrypt.hash(env.adminPassword, 10);
      if (!user) {
        user = await User.create({
          name: 'Admin',
          email: normalizedEmail,
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

  if (!env.mongoUri) {
    throw new Error('Invalid login');
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) throw new Error('Invalid login');
  if (!user.active) {
    const err = new Error('This account is disabled. Ask your admin to re-enable it under Team access.');
    err.status = 403;
    throw err;
  }
  const ok = await bcrypt.compare(normalizedPassword, user.passwordHash);
  if (!ok) throw new Error('Invalid login');
  return { user, accessToken: signAccessToken(user) };
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
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw new Error('Current password is incorrect');
  user.passwordHash = await bcrypt.hash(newPassword, 10);
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

module.exports = { login, signAccessToken, signExtensionToken, getMe, changePassword, resetPassword };
