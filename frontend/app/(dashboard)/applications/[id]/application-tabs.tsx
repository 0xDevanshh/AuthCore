"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { routes } from "@/lib/navigation"

/**
 * Tab bar for an Application.
 *
 * Each tab is a real route, not client state: the tab you are on survives a
 * reload, can be linked to a colleague, and moves the browser's back button.
 * The shadcn Tabs parts supply the styling and roving-focus behaviour while
 * Next handles navigation, so every trigger renders as an anchor with a real
 * href.
 *
 * `value` is derived from the pathname rather than held in state, which keeps
 * the highlight correct however the route was reached — click, back button, or
 * a pasted URL.
 */
export function ApplicationTabs({ applicationId }: { applicationId: string }) {
  const pathname = usePathname()

  const tabs = [
    { value: "overview", label: "Overview", href: routes.application(applicationId) },
    { value: "api-keys", label: "API Keys", href: routes.apiKeys(applicationId) },
    { value: "members", label: "Members", href: routes.team(applicationId) },
    { value: "invitations", label: "Invitations", href: routes.invitations(applicationId) },
    { value: "audit-logs", label: "Audit Logs", href: routes.auditLogs(applicationId) },
  ]

  // Longest matching href wins, so /members does not also light up Overview
  // (whose href is a prefix of every other tab's).
  const active =
    tabs
      .filter((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? tabs[0]

  return (
    <Tabs value={active.value}>
      <TabsList className="w-full justify-start overflow-x-auto">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            render={<Link href={tab.href} />}
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
