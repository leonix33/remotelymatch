const { z } = require('zod');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Profile = require('../models/Profile');
const teamService = require('../services/teamService');
const Team = require('../models/Team');
const emailService = require('../services/emailService');
const userDataService = require('../services/userDataService');
const authService = require('../services/authService');
const profileService = require('../services/profileService');
const env = require('../config/env');
const {
  isAdminRole,
  isSuperAdminRole,
  isProtectedAccount,
  assertCanModifyUser,
} = require('../utils/roles');

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'user']).default('user'),
});

async function listUsers(req, res, next) {
  try {
    const team = await teamService.getTeamForUser(req.user.sub);
    const actor = await User.findById(req.user.sub).select('teamId role');
    if (team && actor && actor.teamId?.toString() !== team._id.toString()) {
      actor.teamId = team._id;
      await actor.save();
    }
    const query = team?._id ? { teamId: team._id } : {};
    const users = await User.find(query).select('-passwordHash').sort({ createdAt: -1 }).lean();
    if (!env.mongoUri || !users.length) {
      return res.json(users);
    }
    const profiles = await Profile.find({
      userId: { $in: users.map((u) => u._id) },
    })
      .select('userId applicantName displayName')
      .lean();
    const profileByUser = new Map(profiles.map((p) => [p.userId.toString(), p]));
    res.json(
      users.map((user) => {
        const profile = profileByUser.get(user._id.toString());
        return {
          ...user,
          applicantName: profile?.applicantName || '',
          displayName: profile?.displayName || '',
        };
      })
    );
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const body = createUserSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();
    const password = body.password.trim();
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const adminTeam = await teamService.getTeamForUser(req.user.sub);
    if (adminTeam) {
      const limits = Team.planLimits(adminTeam.plan);
      const members = await User.countDocuments({ teamId: adminTeam._id, active: true });
      if (members >= limits.members) {
        return res.status(403).json({
          message: `Team member limit reached (${members}/${limits.members} seats on ${adminTeam.plan}). Remove a member or upgrade your plan before inviting someone new.`,
        });
      }
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({
        message: exists.teamId?.toString() === adminTeam?._id?.toString()
          ? 'That email is already on your team. Reset their password or unblock them instead of creating a new invite.'
          : 'Email already exists on another account. Use a different email or remove the old account first.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: body.name.trim(),
      email,
      role: body.role,
      passwordHash,
      teamId: adminTeam?._id,
      active: true,
    });
    await profileService.update(user._id, {
      applicantName: body.name.trim(),
      displayName: body.name.trim(),
    });

    let inviteEmailSent = false;
    let inviteEmailError = null;
    try {
      const inviter = await User.findById(req.user.sub).select('name');
      const result = await emailService.notifyTeamInvite({
        to: user.email,
        name: user.name,
        email: user.email,
        password,
        invitedByName: inviter?.name,
      });
      inviteEmailSent = Boolean(result.sent);
      if (!result.sent) inviteEmailError = result.reason || 'Email is not configured';
    } catch (err) {
      console.warn('Invite email failed:', err.message);
      inviteEmailError = err.message;
    }

    res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      inviteEmailSent,
      inviteEmailError,
      loginUrl: `${env.appUrl.replace(/\/$/, '')}/login`,
    });
  } catch (err) {
    next(err);
  }
}

const patchUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(['admin', 'user']).optional(),
  active: z.boolean().optional(),
  applicantName: z.string().min(2).optional().or(z.literal('')),
  displayName: z.string().min(2).optional().or(z.literal('')),
});

async function updateUser(req, res, next) {
  try {
    const body = patchUserSchema.parse(req.body);
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const actor = { role: req.user.role, sub: req.user.sub };

    if (user._id.toString() !== req.user.sub) {
      try {
        assertCanModifyUser(actor, user, env.adminEmail);
      } catch (guardErr) {
        return res.status(guardErr.status || 403).json({ message: guardErr.message });
      }
    }

    if (user._id.toString() === req.user.sub && body.active === false) {
      return res.status(400).json({ message: 'You cannot disable your own account' });
    }
    if (user._id.toString() === req.user.sub && body.role && body.role !== user.role) {
      return res.status(400).json({ message: 'You cannot change your own role' });
    }

    if (body.role === 'user' && isAdminRole(user.role)) {
      try {
        assertCanModifyUser(actor, user, env.adminEmail, 'demote-admin');
      } catch (guardErr) {
        return res.status(guardErr.status || 403).json({ message: guardErr.message });
      }
      const admins = await userDataService.countActiveAdmins(user._id);
      if (admins === 0) {
        return res.status(400).json({ message: 'Cannot demote the last admin' });
      }
    }

    if (typeof body.active === 'boolean' && body.active === false && isProtectedAccount(user, env.adminEmail)) {
      if (!isSuperAdminRole(actor.role) || user._id.toString() === req.user.sub) {
        return res.status(403).json({ message: 'Cannot disable super admin' });
      }
    }

    if (body.name) user.name = body.name;
    if (body.role) user.role = body.role;
    if (typeof body.active === 'boolean') user.active = body.active;
    await user.save();
    if (body.role === 'admin') {
      await teamService.ensureTeamForUser(user);
    }
    let profileFields = {};
    if (body.applicantName !== undefined) profileFields.applicantName = body.applicantName.trim();
    if (body.displayName !== undefined) profileFields.displayName = body.displayName.trim();
    if (Object.keys(profileFields).length) {
      const profile = await profileService.update(user._id, profileFields);
      profileFields = {
        applicantName: profile.applicantName || '',
        displayName: profile.displayName || '',
      };
    }
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      ...profileFields,
    });
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    if (req.params.id === req.user.sub) {
      return res.status(400).json({ message: 'You cannot delete your own account here' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    try {
      assertCanModifyUser({ role: req.user.role }, user, env.adminEmail);
    } catch (guardErr) {
      return res.status(guardErr.status || 403).json({ message: guardErr.message });
    }

    if (isAdminRole(user.role)) {
      const admins = await userDataService.countActiveAdmins(user._id);
      if (admins === 0) {
        return res.status(400).json({ message: 'Cannot delete the last admin' });
      }
    }
    await userDataService.adminRemoveUser(user._id);
    res.json({ message: 'User deleted', email: user.email });
  } catch (err) {
    next(err);
  }
}

const resetPasswordSchema = z.object({
  password: z.string().min(8),
});

async function resetPassword(req, res, next) {
  try {
    const body = resetPasswordSchema.parse(req.body);
    const password = body.password.trim();
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    const user = await User.findById(req.params.id).select('name email active role');
    if (!user) return res.status(404).json({ message: 'User not found' });

    try {
      assertCanModifyUser({ role: req.user.role }, user, env.adminEmail);
    } catch (guardErr) {
      return res.status(guardErr.status || 403).json({ message: guardErr.message });
    }

    const result = await authService.resetPassword(req.params.id, password);

    let resetEmailSent = false;
    let resetEmailError = null;
    try {
      const emailResult = await emailService.notifyPasswordReset({
        to: user.email,
        name: user.name,
        email: user.email,
        password,
      });
      resetEmailSent = Boolean(emailResult.sent);
      if (!resetEmailSent) resetEmailError = emailResult.reason || 'Email not configured';
    } catch (err) {
      console.warn('Password reset email failed:', err.message);
      resetEmailError = err.message;
    }

    res.json({
      message: 'Password reset',
      email: result.email,
      name: result.name,
      resetEmailSent,
      resetEmailError,
      loginUrl: `${env.appUrl.replace(/\/$/, '')}/login`,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, createUser, updateUser, deleteUser, resetPassword };
