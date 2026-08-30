"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { AppWindowIcon, ScrollTextIcon, SettingsIcon, UsersIcon, MailIcon, LayoutGridIcon } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { ApplicationSwitcher } from "@/components/dashboard/application-switcher"
import {
  getActiveApplicationId,
  routes,
  type ApplicationSummary,
} from "@/lib/navigation"

export function AppSidebar({
  applications,
}: {
  applications: ApplicationSummary[]
}) {
  const pathname = usePathname()
  const activeApplicationId = getActiveApplicationId(pathname)

  const applicationNav = activeApplicationId
    ? [
        {
          title: "Overview",
          href: routes.application(activeApplicationId),
          icon: LayoutGridIcon,
        },
        {
          title: "Team",
          href: routes.team(activeApplicationId),
          icon: UsersIcon,
        },
        {
          title: "Invitations",
          href: routes.invitations(activeApplicationId),
          icon: MailIcon,
        },
        {
          title: "Audit Logs",
          href: routes.auditLogs(activeApplicationId),
          icon: ScrollTextIcon,
        },
      ]
    : []

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3">
        <Link
          href={routes.applications}
          className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center"
        >
          {/* Wordmark placeholder — swap for the real AuthCore mark. */}
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground"
          >
            A
          </span>
          <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            AuthCore
          </span>
        </Link>

        {/*
         * The switcher only appears inside an Application, so the user can hop
         * between Applications without returning to the list first.
         */}
        {activeApplicationId ? (
          <ApplicationSwitcher
            applications={applications}
            activeApplicationId={activeApplicationId}
          />
        ) : null}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  // Exact match only: inside an Application the "Application"
                  // group below carries the active state instead.
                  isActive={pathname === routes.applications}
                  tooltip="Applications"
                  render={<Link href={routes.applications} />}
                >
                  <AppWindowIcon />
                  <span>Applications</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {applicationNav.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Application</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {applicationNav.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={pathname === item.href}
                      tooltip={item.title}
                      render={<Link href={item.href} />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname.startsWith(routes.settings)}
              tooltip="Settings"
              render={<Link href={routes.settings} />}
            >
              <SettingsIcon />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
