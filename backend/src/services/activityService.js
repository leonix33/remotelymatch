const env = require('../config/env');
const User = require('../models/User');
const LoginEvent = require('../models/LoginEvent');
const UserActivityEvent = require('../models/UserActivityEvent');
const Application = require('../models/Application');

function mongoReady() {
  return Boolean(env.mongoUri);
}

function getRequestMeta(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req?.ip || req?.socket?.remoteAddress || '';
  const userAgent = String(req?.headers?.['user-agent'] || '').slice(0, 500);
  return { ip, userAgent };
}

async function touchUserLogin(user, method) {
  if (!user?._id || !mongoReady()) return;
  await User.findByIdAndUpdate(user._id, {
    lastLoginAt: new Date(),
    lastLoginMethod: method,
    $inc: { loginCount: 1 },
  });
}

async function recordLogin({ req, email, user, method = 'password', success = true, reason = '' }) {
  if (!mongoReady()) return null;
  const { ip, userAgent } = getRequestMeta(req);
  const normalizedEmail = String(email || user?.email || '').trim().toLowerCase();
  try {
    if (success && user?._id) {
      await touchUserLogin(user, method);
    }
    return await LoginEvent.create({
      userId: user?._id || undefined,
      email: normalizedEmail,
      userName: user?.name || '',
      role: user?.role || 'user',
      method,
      success,
      reason: String(reason || '').slice(0, 300),
      ip,
      userAgent,
      occurredAt: new Date(),
    });
  } catch (err) {
    console.warn('Login event log failed:', err.message);
    return null;
  }
}

async function resolveUserSnapshot(userId) {
  if (!userId || !mongoReady()) return { email: '', userName: '', role: 'user' };
  const user = await User.findById(userId).select('email name role').lean();
  return {
    email: user?.email || '',
    userName: user?.name || '',
    role: user?.role || 'user',
  };
}

async function recordActivity({
  req,
  userId,
  email,
  userName,
  type,
  entityType = '',
  entityId = '',
  summary = '',
  meta = {},
}) {
  if (!mongoReady() || !userId) return null;
  const { ip, userAgent } = getRequestMeta(req);
  let resolvedEmail = email;
  let resolvedName = userName;
  if (!resolvedEmail || !resolvedName) {
    const snap = await resolveUserSnapshot(userId);
    resolvedEmail = resolvedEmail || snap.email;
    resolvedName = resolvedName || snap.userName;
  }
  try {
    return await UserActivityEvent.create({
      userId,
      email: String(resolvedEmail || '').toLowerCase(),
      userName: resolvedName || '',
      type,
      entityType,
      entityId: String(entityId || ''),
      summary: String(summary || '').slice(0, 500),
      meta,
      ip,
      userAgent,
      occurredAt: new Date(),
    });
  } catch (err) {
    console.warn('Activity event log failed:', err.message);
    return null;
  }
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function getObservabilityDashboard({ days = 7, limit = 80 } = {}) {
  if (!mongoReady()) {
    return {
      mongoRequired: true,
      summary: {
        totalUsers: 0,
        activeUsers: 0,
        loginsToday: 0,
        failedLoginsToday: 0,
        applicationsToday: 0,
        activitiesToday: 0,
      },
      users: [],
      loginEvents: [],
      activityFeed: [],
      applications: [],
    };
  }

  const since = new Date(Date.now() - Math.min(90, Math.max(1, Number(days) || 7)) * 86400000);
  const today = startOfDay();
  const cap = Math.min(200, Math.max(20, Number(limit) || 80));

  const [
    totalUsers,
    users,
    loginEvents,
    activityFeed,
    applications,
    loginsToday,
    failedLoginsToday,
    applicationsToday,
    activitiesToday,
    activeUserIds,
  ] = await Promise.all([
    User.countDocuments({ active: true }),
    User.find({})
      .select('name email role active lastLoginAt lastLoginMethod loginCount createdAt updatedAt')
      .sort({ lastLoginAt: -1, updatedAt: -1 })
      .limit(100)
      .lean(),
    LoginEvent.find({ occurredAt: { $gte: since } })
      .sort({ occurredAt: -1 })
      .limit(cap)
      .lean(),
    UserActivityEvent.find({ occurredAt: { $gte: since } })
      .sort({ occurredAt: -1 })
      .limit(cap)
      .lean(),
    Application.find({ lastAttempted: { $gte: since } })
      .sort({ lastAttempted: -1 })
      .limit(cap)
      .populate('userId', 'name email role')
      .lean(),
    LoginEvent.countDocuments({ success: true, occurredAt: { $gte: today } }),
    LoginEvent.countDocuments({ success: false, occurredAt: { $gte: today } }),
    Application.countDocuments({ lastAttempted: { $gte: today } }),
    UserActivityEvent.countDocuments({ occurredAt: { $gte: today } }),
    UserActivityEvent.distinct('userId', { occurredAt: { $gte: since } }),
  ]);

  const applicationCounts = await Application.aggregate([
    { $group: { _id: '$userId', count: { $sum: 1 }, lastApplied: { $max: '$lastAttempted' } } },
  ]);
  const appCountByUser = new Map(applicationCounts.map((row) => [String(row._id), row]));

  const lastActivityAgg = await UserActivityEvent.aggregate([
    { $sort: { occurredAt: -1 } },
    {
      $group: {
        _id: '$userId',
        lastActivityAt: { $first: '$occurredAt' },
        lastType: { $first: '$type' },
        lastSummary: { $first: '$summary' },
      },
    },
  ]);
  const lastActivityByUser = new Map(lastActivityAgg.map((row) => [String(row._id), row]));

  const userRows = users.map((user) => {
    const id = String(user._id);
    const apps = appCountByUser.get(id);
    const activity = lastActivityByUser.get(id);
    return {
      id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active !== false,
      lastLoginAt: user.lastLoginAt,
      lastLoginMethod: user.lastLoginMethod || '',
      loginCount: user.loginCount || 0,
      applicationCount: apps?.count || 0,
      lastAppliedAt: apps?.lastApplied || null,
      lastActivityAt: activity?.lastActivityAt || null,
      lastActivityType: activity?.lastType || '',
      lastActivitySummary: activity?.lastSummary || '',
      createdAt: user.createdAt,
    };
  });

  return {
    mongoRequired: false,
    summary: {
      totalUsers,
      activeUsers: activeUserIds.filter(Boolean).length,
      loginsToday,
      failedLoginsToday,
      applicationsToday,
      activitiesToday,
      windowDays: Math.min(90, Math.max(1, Number(days) || 7)),
    },
    users: userRows,
    loginEvents: loginEvents.map((row) => ({
      id: String(row._id),
      userId: row.userId ? String(row.userId) : '',
      email: row.email,
      userName: row.userName,
      role: row.role,
      method: row.method,
      success: row.success,
      reason: row.reason,
      ip: row.ip,
      occurredAt: row.occurredAt,
    })),
    activityFeed: activityFeed.map((row) => ({
      id: String(row._id),
      userId: row.userId ? String(row.userId) : '',
      email: row.email,
      userName: row.userName,
      type: row.type,
      entityType: row.entityType,
      entityId: row.entityId,
      summary: row.summary,
      meta: row.meta || {},
      occurredAt: row.occurredAt,
    })),
    applications: applications.map((row) => ({
      id: String(row._id),
      userId: row.userId?._id ? String(row.userId._id) : String(row.userId || ''),
      userName: row.userId?.name || '',
      email: row.userId?.email || '',
      jobId: row.jobId,
      title: row.title,
      company: row.company,
      status: row.status,
      source: row.source,
      matchPct: row.matchPct,
      submittedAt: row.submittedAt,
      lastAttempted: row.lastAttempted,
    })),
  };
}

module.exports = {
  getRequestMeta,
  recordLogin,
  recordActivity,
  getObservabilityDashboard,
};
