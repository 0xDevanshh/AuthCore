/**
 * Client mirror of backend/src/constants/permissions.ts and constants/roles.ts.
 *
 * Used only to decide whether to *render* an action. The backend re-checks every
 * request through `requirePermission`, so nothing here is a security boundary —
 * being wrong shows a button that 403s, it does not grant anything.
 */

export const PERMISSIONS = {
  APPLICATION_UPDATE: "application:update",
  APPLICATION_DELETE: "application:delete",

  APIKEY_CREATE: "apikey:create",
  APIKEY_REVOKE: "apikey:revoke",
  APIKEY_LIST: "apikey:list",

  MEMBER_LIST: "member:list",
  MEMBER_INVITE: "member:invite",
  MEMBER_REMOVE: "member:remove",
  MEMBER_ROLE_UPDATE: "member:role_update",

  AUDIT_LOG_VIEW: "audit_log:view",
} as const

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ALL_PERMISSIONS: readonly PermissionKey[] =
  Object.values(PERMISSIONS)

export const ROLE_NAMES = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
} as const

export type RoleName = (typeof ROLE_NAMES)[keyof typeof ROLE_NAMES]

/**
 * The permission sets seeded with every new application: Owner holds
 * everything, Admin is Owner minus application deletion, Member is read-only.
 *
 * CAVEAT — this is the *seeded* mapping. Permission rows are per-application
 * (`@@unique([applicationId, key])`), so an application whose roles have been
 * customised can diverge from this table, and the UI would then show or hide
 * the wrong buttons. The backend stays correct either way. The real fix is a
 * backend endpoint that returns the caller's actual permission list — see the
 * note in application-context.tsx.
 */
export const ROLE_PERMISSIONS: Record<RoleName, readonly PermissionKey[]> = {
  [ROLE_NAMES.OWNER]: ALL_PERMISSIONS,

  [ROLE_NAMES.ADMIN]: ALL_PERMISSIONS.filter(
    (permission) => permission !== PERMISSIONS.APPLICATION_DELETE,
  ),

  [ROLE_NAMES.MEMBER]: [PERMISSIONS.AUDIT_LOG_VIEW],
}

/** Union of the permissions granted by every role the member holds. */
export function permissionsForRoles(
  roles: readonly string[],
): PermissionKey[] {
  const granted = new Set<PermissionKey>()

  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role as RoleName] ?? []) {
      granted.add(permission)
    }
  }

  return [...granted]
}

/**
 * The role to display when someone holds several. Ordered by authority so a
 * user who is both Owner and Member reads as "Owner".
 */
export function primaryRole(roles: readonly string[]): string | null {
  for (const name of [ROLE_NAMES.OWNER, ROLE_NAMES.ADMIN, ROLE_NAMES.MEMBER]) {
    if (roles.includes(name)) {
      return name
    }
  }

  return roles[0] ?? null
}
