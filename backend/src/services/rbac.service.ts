import { ApplicationStatus, MemberStatus } from "@prisma/client";

import { prisma } from "../config/prisma.ts";

export interface OwnMembershipLookup {
  applicationExists: boolean;

  /** Null when the application exists but the caller isn't an active member. */
  membership: {
    id: string;
    roleIds: string[];
    roleNames: string[];
  } | null;
}

/**
 * The one query behind "what is my standing in this application?" — reused
 * by both `requirePermission` (which then decides whether to allow or deny
 * one specific action) and the read-only /applications/:id/me endpoint
 * (which just reports the answer). Existence and membership are resolved
 * together, in a single round trip, exactly as `requirePermission` always
 * did; this only factors that query out so a second caller doesn't have to
 * either duplicate it or pay for a second one.
 *
 * Deliberately returns data, not a verdict — no throwing, no audit logging.
 * Each caller's own idea of "this failed" differs (a blocked action is worth
 * recording as a denial; a member simply checking their own role is not), so
 * that judgment stays with the caller.
 */
export async function findOwnMembership(
  applicationId: string,
  userId: string,
): Promise<OwnMembershipLookup> {
  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      status: { not: ApplicationStatus.DELETED },
    },

    select: {
      id: true,

      memberships: {
        where: { userId },

        select: {
          id: true,
          status: true,

          roles: {
            select: {
              roleId: true,
              role: { select: { name: true } },
            },
          },
        },

        take: 1,
      },
    },
  });

  if (!application) {
    return { applicationExists: false, membership: null };
  }

  const membership = application.memberships[0];

  if (!membership || membership.status !== MemberStatus.ACTIVE) {
    return { applicationExists: true, membership: null };
  }

  return {
    applicationExists: true,

    membership: {
      id: membership.id,
      roleIds: membership.roles.map((role) => role.roleId),
      roleNames: membership.roles.map((role) => role.role.name).sort(),
    },
  };
}

/**
 * Returns the union of permission keys granted across a set of roles.
 *
 * One query for every role a membership holds, not one query per role: both
 * callers (requirePermission, getOwnMembershipController) previously ran
 * `Promise.all(roleIds.map(getRolePermissions))` — parallel, so not as bad as
 * a true sequential N+1, but still N round trips to the database for what is
 * one `roleId IN (...)` query. Almost every membership in this system holds
 * exactly one role, so in practice this mostly turns 1 query into 1 query —
 * the saving is real once a membership holds several.
 *
 * Plain strings rather than PermissionKey: rows come from the database,
 * where a role may carry a key this build's catalog does not know about
 * (seeded by an older version, or added by hand). Narrowing here would mean
 * either lying about the type or dropping unrecognised keys.
 *
 * Sorted, deduplicated; empty array for an empty input or roles with no
 * granted permissions.
 */
export async function getPermissionsForRoles(
  roleIds: readonly string[],
): Promise<string[]> {
  if (roleIds.length === 0) {
    return [];
  }

  const rows = await prisma.rolePermission.findMany({
    where: { roleId: { in: [...roleIds] } },

    select: {
      permission: {
        select: { key: true },
      },
    },
  });

  return [...new Set(rows.map((row) => row.permission.key))].sort();
}
