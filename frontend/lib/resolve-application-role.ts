import { apiClient } from "@/lib/api-client"
import type { ApiSuccess, OwnMembershipResponseData } from "@/lib/api-types"
import { primaryRole, type PermissionKey } from "@/lib/permissions"

export type ResolvedRole = {
  role: string | null
  roles: string[]
  permissions: readonly PermissionKey[]
  isRoleKnown: boolean
}

/**
 * Asks the backend directly — `GET /applications/:id/me`, requireAuth only,
 * readable by any active member regardless of what they can do.
 *
 * This used to be inferred from whether `GET /applications/:id/members`
 * happened to succeed, since no endpoint answered "what am I allowed to do
 * here?" directly. That heuristic was both slower (a full member-list fetch
 * just to find one row) and imprecise — it could only tell Member apart from
 * Owner/Admin by whether the member:list permission happened to be missing,
 * which breaks for a customised role. This endpoint returns the real answer
 * in one request, computed from the exact same lookup `requirePermission`
 * itself uses to decide every other route in this application.
 */
export async function resolveApplicationRole(
  applicationId: string,
): Promise<ResolvedRole> {
  try {
    const response = await apiClient.get<ApiSuccess<OwnMembershipResponseData>>(
      `/applications/${applicationId}/me`,
    )

    const { roles, permissions } = response.data.data

    return {
      role: primaryRole(roles),
      roles,
      // Trusted as-is: this is our own backend, answering from the same
      // permission catalog the client's PermissionKey union is generated
      // from — not third-party data worth runtime-validating.
      permissions: permissions as PermissionKey[],
      isRoleKnown: true,
    }
  } catch {
    // A 403 here means genuinely not an active member — the creator is
    // always given one in the same transaction that creates the
    // Application, so there is no legitimate case left to fall back to.
    // Any other failure (network, 5xx) is likewise left unknown, which
    // makes usePermission fail open rather than show a wrong badge.
    return { role: null, roles: [], permissions: [], isRoleKnown: false }
  }
}
