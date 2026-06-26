/** App-level role → capability flags (mirrors legacy Discord role permissions). */

export const ROLE_PERMISSIONS = {
  admin: {
    level: "ADMIN",
    canBroadcast: true,
    canPromoteUsers: true,
    canPromoteWhenInactive: true,
    canClearMessages: true,
    canDeleteMessages: true,
    canToggleJoinDebug: false,
    canApproveRequests: true,
    canDenyRequests: true,
    canCreateShareLinks: true,
  },
  broadcaster: {
    level: "BROADCASTER",
    canBroadcast: true,
    canPromoteUsers: true,
    canPromoteWhenInactive: false,
    canClearMessages: false,
    canDeleteMessages: true,
    canToggleJoinDebug: false,
    canApproveRequests: true,
    canDenyRequests: true,
    canCreateShareLinks: true,
  },
  listener: {
    level: "LISTENER",
    canBroadcast: false,
    canPromoteUsers: false,
    canPromoteWhenInactive: false,
    canClearMessages: false,
    canDeleteMessages: false,
    canToggleJoinDebug: false,
    canApproveRequests: false,
    canDenyRequests: false,
    canCreateShareLinks: false,
  },
};

export function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.listener;
}

export function roleInfoForUser(user) {
  if (!user) return { level: null, permissions: {}, roleColor: null, roleType: null };
  const permissions = permissionsForRole(user.role);
  return {
    level: permissions.level,
    permissions,
    roleColor: roleAccentColor(user.role),
    roleType: user.role ?? "listener",
  };
}

function roleAccentColor(role) {
  if (role === "admin") return "#87CEFA";
  if (role === "broadcaster") return "#90EE90";
  return "#9ca3af";
}

export async function canUserBroadcast(userId, getUserById) {
  const user = await getUserById(userId);
  return permissionsForRole(user?.role).canBroadcast === true;
}

export async function isUserAdmin(userId, getUserById) {
  const user = await getUserById(userId);
  return user?.role === "admin";
}

export async function canUserPromote(userId, isCurrentBroadcaster, getUserById) {
  const user = await getUserById(userId);
  const perms = permissionsForRole(user?.role);
  if (perms.canPromoteUsers && perms.canPromoteWhenInactive) return true;
  if (perms.canPromoteUsers && !perms.canPromoteWhenInactive && isCurrentBroadcaster) return true;
  return false;
}
