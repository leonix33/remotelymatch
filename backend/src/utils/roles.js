const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  USER: 'user',
};

function isAdminRole(role) {
  return role === ROLES.ADMIN || role === ROLES.SUPERADMIN;
}

function isSuperAdminRole(role) {
  return role === ROLES.SUPERADMIN;
}

function isSovereignEmail(email, adminEmail) {
  const sovereign = String(adminEmail || '').trim().toLowerCase();
  const target = String(email || '').trim().toLowerCase();
  return Boolean(sovereign && target && sovereign === target);
}

function isProtectedAccount(user, adminEmail) {
  if (!user) return false;
  return isSuperAdminRole(user.role) || isSovereignEmail(user.email, adminEmail);
}

function assertCanModifyUser(actor, target, adminEmail, action = 'modify') {
  if (!target) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  if (isProtectedAccount(target, adminEmail) && !isSuperAdminRole(actor?.role)) {
    const err = new Error('Cannot modify super admin');
    err.status = 403;
    throw err;
  }

  if (action === 'demote-admin' && !isSuperAdminRole(actor?.role)) {
    const err = new Error('Only super admin can change admin roles');
    err.status = 403;
    throw err;
  }
}

module.exports = {
  ROLES,
  isAdminRole,
  isSuperAdminRole,
  isSovereignEmail,
  isProtectedAccount,
  assertCanModifyUser,
};
