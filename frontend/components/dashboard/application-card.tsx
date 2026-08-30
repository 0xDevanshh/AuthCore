import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatAbsoluteDate, formatRelativeTime } from "@/lib/format"
import { routes } from "@/lib/navigation"
import type { Application } from "@/lib/api-types"

/**
 * One application in the list.
 *
 * Deliberately sparse — name, status, and a single timestamp. This grid is a
 * chooser, not a report: anything denser competes with the one decision being
 * made here, which is which application to open.
 *
 * The whole card is a single anchor rather than a click handler on a div, so it
 * keeps native link behaviour: keyboard focus, middle-click, open-in-new-tab,
 * and a real URL on hover.
 */
export function ApplicationCard({ application }: { application: Application }) {
  return (
    <Card
      // `relative` anchors the stretched link's ::after to this card.
      className="group/app-card relative gap-3 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring/50"
      size="sm"
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="truncate text-sm font-semibold">
            <Link
              href={routes.application(application.id)}
              // Stretched so the entire card is the hit area while the anchor
              // itself stays a normal inline element for assistive tech.
              className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
            >
              {application.name}
            </Link>
          </CardTitle>

          {application.status !== "ACTIVE" ? (
            <Badge variant="destructive" className="shrink-0">
              {application.status === "SUSPENDED" ? "Suspended" : "Deleted"}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-1">
        <p className="truncate font-mono text-xs text-muted-foreground">
          {application.slug}
        </p>
        <p
          className="text-xs text-muted-foreground"
          title={formatAbsoluteDate(application.createdAt)}
        >
          Created {formatRelativeTime(application.createdAt)}
        </p>
      </CardContent>
    </Card>
  )
}
