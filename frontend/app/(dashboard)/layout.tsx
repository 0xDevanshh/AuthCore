import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { AccountMenu, type AccountUser } from "@/components/dashboard/account-menu"
import type { ApplicationSummary } from "@/lib/navigation"

/*
 * Placeholder data. Replaced with the real session + Applications fetch once the
 * API layer lands; the component props below are already the shape it should return.
 */
const PLACEHOLDER_USER: AccountUser = {
  name: "Signed-in User",
  email: "user@example.com",
}

const PLACEHOLDER_APPLICATIONS: ApplicationSummary[] = []

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <AppSidebar applications={PLACEHOLDER_APPLICATIONS} />
      <SidebarInset className="bg-panel">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          {/* Breadcrumbs land here in a later step. */}
          <div className="ml-auto flex items-center gap-2">
            <AccountMenu user={PLACEHOLDER_USER} />
          </div>
        </header>

        {/*
         * The panel is the recessed surface; page content composes white Cards
         * (with shadow-sm/shadow-md) on top of it.
         */}
        <div className="flex flex-1 flex-col">
          <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 md:px-8 md:py-10">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
