const Team = require('../models/Team');
const User = require('../models/User');
const env = require('../config/env');
const { isAdminRole } = require('../utils/roles');

function requireMongo() {
  if (!env.mongoUri) throw new Error('MongoDB is required');
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function ensureTeamForUser(user) {
  requireMongo();
  if (user.teamId) {
    const team = await Team.findById(user.teamId);
    if (team) return team;
  }

  if (isAdminRole(user.role)) {
    let team = await Team.findOne({ ownerId: user._id });
    if (!team) {
      team = await Team.create({ name: `${user.name}'s Team`, ownerId: user._id, plan: 'free' });
    }
    user.teamId = team._id;
    await user.save();
    return team;
  }

  const admin =
    (await User.findOne({ role: 'superadmin', active: true })) ||
    (await User.findOne({ role: 'admin', active: true }));
  if (admin?.teamId) {
    user.teamId = admin.teamId;
    await user.save();
    return Team.findById(admin.teamId);
  }

  return null;
}

async function getTeamForUser(userId) {
  requireMongo();
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  return ensureTeamForUser(user);
}

function resetUsageIfNewMonth(team) {
  const month = currentMonth();
  if (team.usageMonth !== month) {
    team.usageMonth = month;
    team.usage = { agentRuns: 0, aiCalls: 0, approvals: 0 };
  }
  return team;
}

async function checkLimit(userId, type) {
  const team = await getTeamForUser(userId);
  if (!team) return { ok: true, unlimited: true };

  resetUsageIfNewMonth(team);
  const limits = Team.planLimits(team.plan);
  const key = type === 'agent' ? 'agentRuns' : type === 'ai' ? 'aiCalls' : 'approvals';
  const limitKey = `${key === 'agentRuns' ? 'agentRuns' : key === 'aiCalls' ? 'aiCalls' : 'approvals'}PerMonth`;
  const max = limits[limitKey] || 999;
  const used = team.usage[key] || 0;

  if (used >= max) {
    throw new Error(`Team ${team.plan} plan limit reached for ${type} (${max}/month). Upgrade to Pro.`);
  }
  return { ok: true, team, used, max, plan: team.plan };
}

async function incrementUsage(userId, type) {
  const team = await getTeamForUser(userId);
  if (!team) return;
  resetUsageIfNewMonth(team);
  const key = type === 'agent' ? 'agentRuns' : type === 'ai' ? 'aiCalls' : 'approvals';
  team.usage[key] = (team.usage[key] || 0) + 1;
  await team.save();
}

async function getUsageSummary(userId) {
  const team = await getTeamForUser(userId);
  if (!team) return null;
  resetUsageIfNewMonth(team);
  await team.save();
  const limits = Team.planLimits(team.plan);
  const members = await User.countDocuments({ teamId: team._id, active: true });
  return {
    plan: team.plan,
    name: team.name,
    limits,
    usage: team.usage,
    members,
    usageMonth: team.usageMonth,
  };
}

async function upgradePlan(userId, plan) {
  requireMongo();
  const user = await User.findById(userId);
  if (!user || !isAdminRole(user.role)) throw new Error('Admin only');
  const team = await ensureTeamForUser(user);
  team.plan = plan;
  await team.save();
  return team;
}

async function assignUserToTeam(userId, teamId) {
  await User.findByIdAndUpdate(userId, { teamId });
}

module.exports = {
  getTeamForUser,
  checkLimit,
  incrementUsage,
  getUsageSummary,
  upgradePlan,
  ensureTeamForUser,
  assignUserToTeam,
};
