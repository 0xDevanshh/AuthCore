import { LockIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

/*
 * TEMPORARY — password change is built in F5.2, not this prompt. This exists
 * only so the settings sub-nav has somewhere to land; replace this file
 * wholesale rather than extending it.
 */
export default function SecuritySettingsPage() {
  return (
    <Card className="items-center gap-4 py-12 text-center shadow-sm">
      <CardContent className="flex max-w-sm flex-col items-center gap-3">
        <div
          aria-hidden
          className="flex size-10 items-center justify-center rounded-full bg-secondary"
        >
          <LockIcon className="size-5 text-muted-foreground" />
        </div>

        <h2 className="text-base font-semibold">Password &amp; security</h2>
        <p className="text-sm text-muted-foreground">
          This section hasn&apos;t been built yet.
        </p>
      </CardContent>
    </Card>
  )
}
