/**
 * Route helpers and navigation model for the authenticated dashboard.
 *
 * Team, audit logs and invitations are scoped to a single Application rather than
 * being top-level concerns, so they live under `/applications/[applicationId]/…`
 * and only appear in the sidebar once an Application is selected.
 */

export type ApplicationSummary = {
  id: string
  name: string
}

export const routes = {
  applications: "/applications",
  application: (applicationId: string) => `/applications/${applicationId}`,
  team: (applicationId: string) => `/applications/${applicationId}/team`,
  auditLogs: (applicationId: string) => `/applications/${applicationId}/audit-logs`,
  invitations: (applicationId: string) => `/applications/${applicationId}/invitations`,
  settings: "/settings",
  login: "/login",
} as const

/**
 * Pulls the active Application id out of a pathname, or null when the user is on a
 * top-level page. Layouts can't read the pathname, so the sidebar derives this
 * client-side instead of taking it as a prop.
 */
export function getActiveApplicationId(pathname: string): string | null {
  const match = pathname.match(/^\/applications\/([^/]+)/)
  return match ? match[1] : null
}
