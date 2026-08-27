/**
 * Names of the roles seeded with every application.
 *
 * Shared because the Owner role is load-bearing: membership changes have to
 * guarantee an application never drops to zero Owners.
 */
export const ROLE_NAMES = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
} as const;

export type RoleName =
  (typeof ROLE_NAMES)[keyof typeof ROLE_NAMES];
