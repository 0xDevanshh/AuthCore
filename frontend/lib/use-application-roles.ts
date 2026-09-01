"use client"

import * as React from "react"

import { apiClient, getApiErrorStatus } from "@/lib/api-client"
import type {
  ApiSuccess,
  ApplicationRole,
  PendingInvitation,
} from "@/lib/api-types"

/*
 * =============================================================================
 * GAP — no endpoint lists an Application's roles
 * =============================================================================
 *
 * Both POST /applications/:id/invitations and
 * PATCH /applications/:id/members/:membershipId/role take a `roleId`, and both
 * look the role up by id (`role.findFirst({ id: roleId, applicationId })`), so a
 * role *name* is rejected with 400 ROLE_APPLICATION_MISMATCH. Yet nothing
 * exposes the ids:
 *
 *   GET /applications/:id           -> the Application row; no roles
 *   GET /applications/:id/members   -> role NAMES only
 *   GET /applications/:id/invitations -> { roleId, roleName }, but only for
 *                                        roles that already have a pending
 *                                        invitation
 *
 * This hook therefore tries the endpoint that ought to exist and falls back to
 * harvesting ids out of the pending invitations it is given. The fallback is
 * genuinely partial: with no pending invitations it yields nothing — which is
 * precisely the empty state, where inviting matters most.
 *
 * Fix: add GET /applications/:id/roles returning `{ id, name }[]`. This hook
 * already calls it; when it lands the fallback simply stops being reached, and
 * the Members tab's role Select becomes buildable too.
 */

/**
 * Remembers, for the session, that the roles endpoint is absent, so opening the
 * invite dialog repeatedly does not repeat a request already known to 404.
 */
let rolesEndpointMissing = false

export type RolesState = {
  roles: ApplicationRole[]
  isLoading: boolean
  /** True when no role ids could be discovered by any route. */
  isUnavailable: boolean
}

export function useApplicationRoles(
  applicationId: string,
  /** Pending invitations already loaded by the caller, used as the fallback. */
  pendingInvitations: PendingInvitation[],
  /** Skips work until the dialog is actually opened. */
  enabled: boolean,
): RolesState {
  /*
   * One piece of state, written only from inside the async effect. Tracking a
   * separate `isLoading` would mean setting it synchronously as the effect
   * starts; deriving it from `done` below keeps every write asynchronous.
   */
  const [fetched, setFetched] = React.useState<{
    done: boolean
    roles: ApplicationRole[] | null
  }>({ done: false, roles: null })

  /** Distinct { id, name } pairs seen on pending invitations. */
  const harvested = React.useMemo<ApplicationRole[]>(() => {
    const byId = new Map<string, ApplicationRole>()

    for (const invitation of pendingInvitations) {
      byId.set(invitation.roleId, {
        id: invitation.roleId,
        name: invitation.roleName,
      })
    }

    return [...byId.values()]
  }, [pendingInvitations])

  const fetchRoles = React.useCallback(async (): Promise<
    ApplicationRole[] | null
  > => {
    if (rolesEndpointMissing) {
      return null
    }

    try {
      const response = await apiClient.get<
        ApiSuccess<{ roles: ApplicationRole[] }>
      >(`/applications/${applicationId}/roles`)

      return response.data.data.roles
    } catch (caught) {
      const status = getApiErrorStatus(caught)

      // 404 means the route does not exist; don't ask again this session.
      if (status === 404) {
        rolesEndpointMissing = true
      }

      return null
    }
  }, [applicationId])

  React.useEffect(() => {
    if (!enabled || rolesEndpointMissing) {
      return
    }

    let cancelled = false

    void (async () => {
      const result = await fetchRoles()

      if (!cancelled) {
        setFetched({ done: true, roles: result })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, fetchRoles])

  const isLoading = enabled && !rolesEndpointMissing && !fetched.done

  const resolved = fetched.roles ?? harvested

  return {
    roles: resolved,
    isLoading,
    isUnavailable: !isLoading && resolved.length === 0,
  }
}
