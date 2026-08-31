"use client"

import * as React from "react"

import type { Application } from "@/lib/api-types"
import type { PermissionKey } from "@/lib/permissions"

/**
 * The Application and the caller's standing within it, resolved once by the
 * layout and read by every tab.
 *
 * Tabs must not re-fetch the Application: it is one record, the layout already
 * has it, and refetching per tab would flash a skeleton on every tab change.
 * Each tab fetches only its own data (keys, members, logs).
 */
export type ApplicationContextValue = {
  application: Application

  /**
   * Display name of the caller's role — "Owner" / "Admin" / "Member" — or null
   * when it could not be determined.
   */
  role: string | null

  /** Every role held, since a membership can carry more than one. */
  roles: string[]

  /**
   * Permissions the caller is believed to hold. Advisory only — see
   * `usePermission`.
   */
  permissions: readonly PermissionKey[]

  /**
   * False when the role could not be established and `permissions` is a
   * fallback rather than a derived answer.
   */
  isRoleKnown: boolean

  /** Re-reads the Application, e.g. after a rename on the settings tab. */
  reload: () => Promise<void>
}

const ApplicationContext = React.createContext<ApplicationContextValue | null>(
  null,
)

export function ApplicationProvider({
  value,
  children,
}: {
  value: ApplicationContextValue
  children: React.ReactNode
}) {
  return <ApplicationContext value={value}>{children}</ApplicationContext>
}

/** The current Application. Throws outside the [id] layout. */
export function useApplication(): ApplicationContextValue {
  const context = React.use(ApplicationContext)

  if (!context) {
    throw new Error(
      "useApplication must be used within an Application layout",
    )
  }

  return context
}

/**
 * Whether to show an action gated on `permission`.
 *
 * A UX convenience, not a security control: the backend's `requirePermission`
 * middleware is the real gate, and this only avoids offering buttons that would
 * come back 403.
 *
 * When the role could not be determined this returns **true** — deliberately
 * failing open. Hiding every action on an inconclusive lookup would strand a
 * legitimate Owner with an app they cannot administer, which is a worse and far
 * more likely outcome than showing a button that returns a handled 403. Nothing
 * is exposed by the optimistic answer, because the server still decides.
 */
export function usePermission(permission: PermissionKey): boolean {
  const { permissions, isRoleKnown } = useApplication()

  if (!isRoleKnown) {
    return true
  }

  return permissions.includes(permission)
}

/** Same, for an action needing several permissions at once. */
export function usePermissions(
  required: readonly PermissionKey[],
): boolean {
  const { permissions, isRoleKnown } = useApplication()

  if (!isRoleKnown) {
    return true
  }

  return required.every((permission) => permissions.includes(permission))
}
