"use client"

import Link from "next/link"
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { routes, type ApplicationSummary } from "@/lib/navigation"

export function ApplicationSwitcher({
  applications,
  activeApplicationId,
}: {
  applications: ApplicationSummary[]
  activeApplicationId: string
}) {
  const active = applications.find((app) => app.id === activeApplicationId)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                tooltip={active?.name ?? "Application"}
                className="data-[popup-open]:bg-sidebar-accent"
              >
                <span
                  aria-hidden
                  className="flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary text-[0.625rem] font-semibold text-secondary-foreground"
                >
                  {(active?.name ?? "?").charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 truncate text-left font-medium">
                  {active?.name ?? "Select application"}
                </span>
                <ChevronsUpDownIcon className="text-muted-foreground" />
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent
            align="start"
            side="bottom"
            className="w-(--anchor-width) min-w-56"
          >
            <DropdownMenuLabel>Applications</DropdownMenuLabel>
            {applications.map((app) => (
              <DropdownMenuItem
                key={app.id}
                render={<Link href={routes.application(app.id)} />}
              >
                <span className="flex-1 truncate">{app.name}</span>
                {app.id === activeApplicationId ? (
                  <CheckIcon className="size-4" />
                ) : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href={routes.applications} />}>
              <PlusIcon className="size-4" />
              <span>All applications</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
