/**
 * Permission catalog.
 *
 * Deliberately limited to features that exist in the codebase today —
 * Application, ApiKey, Membership and AuditLog. MFA, invitations and the
 * rest get their permissions when those features land.
 *
 * Note these are seeded per application: the schema declares
 * `@@unique([applicationId, key])` on Permission, so each Application owns
 * its own copy of this catalog rather than pointing at a global one.
 */
export const PERMISSIONS = {
  APPLICATION_UPDATE: "application:update",
  APPLICATION_DELETE: "application:delete",

  APIKEY_CREATE: "apikey:create",
  APIKEY_REVOKE: "apikey:revoke",
  APIKEY_LIST: "apikey:list",

  MEMBER_INVITE: "member:invite",
  MEMBER_REMOVE: "member:remove",
  MEMBER_ROLE_UPDATE: "member:role_update",

  AUDIT_LOG_VIEW: "audit_log:view",
} as const;

export type PermissionKey =
  (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly PermissionKey[] =
  Object.values(PERMISSIONS);

export const PERMISSION_DESCRIPTIONS: Record<
  PermissionKey,
  string
> = {
  [PERMISSIONS.APPLICATION_UPDATE]:
    "Update application settings.",
  [PERMISSIONS.APPLICATION_DELETE]:
    "Delete the application.",

  [PERMISSIONS.APIKEY_CREATE]:
    "Create API keys.",
  [PERMISSIONS.APIKEY_REVOKE]:
    "Revoke API keys.",
  [PERMISSIONS.APIKEY_LIST]:
    "List API keys.",

  [PERMISSIONS.MEMBER_INVITE]:
    "Invite members to the application.",
  [PERMISSIONS.MEMBER_REMOVE]:
    "Remove members from the application.",
  [PERMISSIONS.MEMBER_ROLE_UPDATE]:
    "Change the roles assigned to a member.",

  [PERMISSIONS.AUDIT_LOG_VIEW]:
    "View the application audit log.",
};

/**
 * Permissions granted to each role seeded with a new application.
 *
 * Owner holds everything; Admin is Owner minus the ability to delete the
 * application; Member is read-only.
 */
export const OWNER_PERMISSIONS: readonly PermissionKey[] =
  ALL_PERMISSIONS;

export const ADMIN_PERMISSIONS: readonly PermissionKey[] =
  ALL_PERMISSIONS.filter(
    (permission) =>
      permission !== PERMISSIONS.APPLICATION_DELETE,
  );

export const MEMBER_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.AUDIT_LOG_VIEW,
];
