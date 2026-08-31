import { apiClient, getApiErrorCode } from "@/lib/api-client"
import type { ApiSuccess, Application, MemberListResponseData } from "@/lib/api-types"
import {
  ROLE_NAMES,
  permissionsForRoles,
  primaryRole,
  type PermissionKey,
} from "@/lib/permissions"

/*
 * =============================================================================
 * GAP — the backend exposes no "what am I allowed to do here?" endpoint
 * =============================================================================
 *
 * Checked, not assumed. Nothing returns the caller's role or permissions for an
 * application:
 *
 *   GET /applications/:id          -> the Application row only; membership is
 *                                     checked but neither role nor permissions
 *                                     are included in the response.
 *   GET /auth/me                   -> SafeUser; no memberships.
 *   GET /applications/:id/members  -> roles for everyone, but is itself gated
 *                                     on the member:list permission.
 *
 * So the role is inferred from what the members endpoint does when we ask:
 *
 *   200                        -> read the caller's own membership row. Exact.
 *   403 MISSING_PERMISSION     -> an active member without member:list. Of the
 *                                 seeded roles only Member lacks it (Owner and
 *                                 Admin both hold it), so the role is Member.
 *   403 NOT_A_MEMBER           -> not a member; the layout's own fetch of the
 *                                 application would already have failed.
 *   anything else              -> unknown; callers fail open.
 *
 * This is exact for the three seeded roles. It can drift if an application's
 * roles are customised, since permission rows are per-application — a bespoke
 * role that lacks member:list would read as "Member". The badge would then be
 * wrong even though every real check still passes or fails correctly on the
 * server.
 *
 * The proper fix is a backend endpoint — GET /applications/:id/me returning
 * `{ role, roles, permissions }` straight out of the same lookup
 * `requirePermission` already performs. Replace `resolveApplicationRole` with a
 * single call to it when that lands; nothing else in the UI needs to change.
 */

export type ResolvedRole = {
  role: string | null
  roles: string[]
  permissions: readonly PermissionKey[]
  isRoleKnown: boolean
}

export async function resolveApplicationRole(
  application: Application,
  currentUserId: string | null,
): Promise<ResolvedRole> {
  try {
    const response = await apiClient.get<ApiSuccess<MemberListResponseData>>(
      `/applications/${application.id}/members`,
    )

    const members = response.data.data.members

    const mine = currentUserId
      ? members.find((member) => member.userId === currentUserId)
      : undefined

    if (mine && mine.roles.length > 0) {
      return {
        role: primaryRole(mine.roles),
        roles: mine.roles,
        permissions: permissionsForRoles(mine.roles),
        isRoleKnown: true,
      }
    }

    /*
     * The list came back but the caller is not in it, or holds no named role.
     * Ownership is still a definite signal — the creator gets the Owner role —
     * so fall back to that before giving up.
     */
    return ownerFallback(application, currentUserId)
  } catch (caught) {
    const code = getApiErrorCode(caught)

    if (code === "MISSING_PERMISSION") {
      // Active member, no member:list. Among the seeded roles that is Member.
      const roles = [ROLE_NAMES.MEMBER]

      return {
        role: ROLE_NAMES.MEMBER,
        roles,
        permissions: permissionsForRoles(roles),
        isRoleKnown: true,
      }
    }

    return ownerFallback(application, currentUserId)
  }
}

/**
 * `ownerId` is authoritative for one case: the person who created the
 * application holds its Owner role. Everyone else is left unknown, which makes
 * `usePermission` fail open.
 */
function ownerFallback(
  application: Application,
  currentUserId: string | null,
): ResolvedRole {
  if (currentUserId && application.ownerId === currentUserId) {
    const roles = [ROLE_NAMES.OWNER]

    return {
      role: ROLE_NAMES.OWNER,
      roles,
      permissions: permissionsForRoles(roles),
      isRoleKnown: true,
    }
  }

  return { role: null, roles: [], permissions: [], isRoleKnown: false }
}
