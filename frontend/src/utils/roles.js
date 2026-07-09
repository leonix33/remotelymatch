export const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  USER: 'user',
};

export function isAdminRole(role) {
  return role === ROLES.ADMIN || role === ROLES.SUPERADMIN;
}

export function isSuperAdminRole(role) {
  return role === ROLES.SUPERADMIN;
}

export function roleLabel(role) {
  if (role === ROLES.SUPERADMIN) return 'Super admin';
  if (role === ROLES.ADMIN) return 'Admin';
  return 'User';
}

export function canManageUser(actorRole, targetUser) {
  if (!targetUser) return false;
  if (targetUser.role === ROLES.SUPERADMIN && !isSuperAdminRole(actorRole)) return false;
  return true;
}

export function canChangeRole(actorRole, targetUser) {
  if (!targetUser) return false;
  if (targetUser.role === ROLES.SUPERADMIN) return false;
  if (targetUser.role === ROLES.ADMIN && !isSuperAdminRole(actorRole)) return false;
  return true;
}
