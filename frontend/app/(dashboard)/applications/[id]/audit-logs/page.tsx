"use client"

import { LockIcon, ScrollTextIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { PERMISSIONS } from "@/lib/permissions"
import { usePermission } from "../application-context"

/*
 * =============================================================================
 * BLOCKER — the backend records audit events but cannot list them
 * =============================================================================
 *
 * Checked, not assumed. The write path is fully wired: `logAuditEvent`
 * (backend/src/services/audit.service.ts) is called throughout the codebase and
 * writes 23 distinct actions, and the `AuditLog` model carries everything this
 * tab would need — actorType, action, resourceType/resourceId, ipAddress,
 * userAgent, metadata, createdAt.
 *
 * There is no read path at all:
 *
 *   - no audit controller           (src/controllers/ has none)
 *   - no audit route                (nothing under src/routes/ mounts one)
 *   - audit.service.ts exports only `AuditEventInput` and `logAuditEvent`
 *   - `PERMISSIONS.AUDIT_LOG_VIEW` is defined and seeded onto every role, but
 *     is referenced by no route — it currently gates nothing
 *
 * So the table, pagination and action filter in this tab's spec have no data
 * source, and rather than invent a response envelope this page states the
 * situation plainly.
 *
 * WHAT THE BACKEND NEEDS
 *
 *   GET /applications/:id/audit-logs
 *     middleware: requirePermission(PERMISSIONS.AUDIT_LOG_VIEW)
 *     query:      ?limit=50&cursor=<id>&action=<ACTION>
 *     returns:    { logs: AuditLogEntry[], nextCursor: string | null }
 *
 * The schema is already shaped for exactly this — `@@index([applicationId,
 * createdAt])` supports the paged listing and `@@index([action, createdAt])`
 * supports the action filter, so both are index-backed rather than scans.
 *
 * WHAT IS ALREADY BUILT HERE
 *
 * lib/audit-actions.ts holds the readable labels for all 23 actions the
 * backend actually writes (taken from the `logAuditEvent` call sites, not
 * guessed), the sorted action list for the filter dropdown, and the actor
 * formatter. Once the endpoint exists, this page needs the fetch, the table,
 * and the metadata disclosure — the presentation vocabulary is done.
 *
 * One thing to know when building it: there is no LOGIN_SUCCESS action. Sign-in
 * attempts go to the separate `LoginAttempt` table, so a "recent sign-ins" view
 * would be a different endpoint over different data.
 */

export default function AuditLogsPage() {
  const canViewAuditLogs = usePermission(PERMISSIONS.AUDIT_LOG_VIEW)

  /*
   * Gated before anything else. Rendering a table for someone without the
   * permission would promise data that every fetch would refuse — better to say
   * so directly than to show a frame that stays permanently empty.
   */
  if (!canViewAuditLogs) {
    return (
      <Notice
        icon={<LockIcon className="size-5 text-muted-foreground" />}
        title="You don't have permission to view audit logs"
        message="Your role in this application doesn't include audit log access. An owner or admin can change your role."
      />
    )
  }

  /*
   * Deliberately NOT the "No activity yet" empty state. Activity is being
   * recorded — every key creation, invitation and role change writes an entry —
   * so telling the reader there is none would be false. The honest message is
   * that it cannot be read back yet.
   */
  return (
    <Notice
      icon={<ScrollTextIcon className="size-5 text-muted-foreground" />}
      title="Audit logs aren't available to view yet"
      message="Activity in this application is being recorded, but the API doesn't expose a way to read it back yet. This tab will list it once that endpoint exists."
    />
  )
}

function Notice({
  icon,
  title,
  message,
}: {
  icon: React.ReactNode
  title: string
  message: string
}) {
  return (
    <Card className="items-center gap-4 py-12 text-center shadow-sm">
      <CardContent className="flex max-w-md flex-col items-center gap-3">
        <div
          aria-hidden
          className="flex size-10 items-center justify-center rounded-full bg-secondary"
        >
          {icon}
        </div>

        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  )
}
