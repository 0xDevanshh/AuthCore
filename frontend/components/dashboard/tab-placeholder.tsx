import { Card, CardContent } from "@/components/ui/card"

/**
 * TEMPORARY — replace each of these with the real tab.
 *
 * The tab bar needs every tab to resolve to a real route, or clicking one 404s
 * and takes the whole shell with it. These stubs exist only so navigation works
 * end to end; they are meant to be deleted, not extended.
 */
export function TabPlaceholder({ title }: { title: string }) {
  return (
    <Card className="items-center py-12 text-center shadow-sm">
      <CardContent className="flex max-w-sm flex-col items-center gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">
          This section hasn&apos;t been built yet.
        </p>
      </CardContent>
    </Card>
  )
}
