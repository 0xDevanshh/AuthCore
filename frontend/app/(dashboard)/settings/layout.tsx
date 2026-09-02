import { SettingsNav } from "./settings-nav"

/**
 * Shell for the settings section: a page heading, then the sub-nav beside the
 * active section's content. The sub-nav is a fixed-width column on desktop and
 * a horizontal scroller on narrow screens, rather than reflowing underneath —
 * settings is a short, flat list of destinations, not content worth stacking.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account.
        </p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:gap-10">
        <SettingsNav />

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
