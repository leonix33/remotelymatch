const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { isAdminRole, isSuperAdminRole } = require('../utils/roles');
const User = require('../models/User');

async function resolveLegacyDevAdmin(user) {
  if (user.sub !== 'dev-admin' || !env.mongoUri) return user;
  const admin = await User.findOne({
    email: env.adminEmail?.toLowerCase(),
    role: { $in: ['superadmin', 'admin'] },
    active: true,
  });
  if (!admin) {
    const err = new Error('Session expired. Please log out and log in again.');
    err.status = 401;
    throw err;
  }
  return { ...user, sub: admin._id.toString() };
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Missing token' });
  try {
    const payload = jwt.verify(token, env.jwtAccessSecret);
    req.user = await resolveLegacyDevAdmin(payload);
    next();
  } catch (err) {
    const status = err.status || 401;
    return res.status(status).json({ message: err.message || 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (!isAdminRole(req.user?.role)) return res.status(403).json({ message: 'Admin only' });
  next();
}

async function requireAdminFresh(req, res, next) {
  if (!isAdminRole(req.user?.role)) return res.status(403).json({ message: 'Admin only' });
  if (!env.mongoUri || !req.user?.sub || req.user.sub === 'dev-admin') return next();
  try {
    const dbUser = await User.findById(req.user.sub).select('role active email');
    if (!dbUser?.active) return res.status(403).json({ message: 'Account disabled' });
    if (!isAdminRole(dbUser.role)) return res.status(403).json({ message: 'Admin access revoked' });
    req.user.role = dbUser.role;
    req.user.email = dbUser.email;
    next();
  } catch (err) {
    next(err);
  }
}

function requireSuperAdmin(req, res, next) {
  if (!isSuperAdminRole(req.user?.role)) {
    return res.status(403).json({ message: 'Super admin only' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireAdminFresh, requireSuperAdmin };
