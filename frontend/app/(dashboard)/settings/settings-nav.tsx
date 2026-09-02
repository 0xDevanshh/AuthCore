"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LockIcon, ShieldCheckIcon, UserRoundIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { routes } from "@/lib/navigation"

/**
 * Settings sub-nav.
 *
 * Deliberately not the shadcn Tabs used for an Application's tab bar — that
 * component reads as the primary way to switch views inside a busy page.
 * Settings is a destination you leave the main flow to visit, so this is a
 * quieter vertical list: no underline treatment, no full-width bar, just text
 * that highlights on the active section.
 */
export function SettingsNav() {
  const pathname = usePathname()

  const items = [
    {
      label: "Profile",
      href: routes.settingsProfile,
      icon: UserRoundIcon,
    },
    {
      label: "Security",
      href: routes.settingsSecurity,
      icon: LockIcon,
    },
    {
      label: "Two-factor authentication",
      href: routes.settingsMfa,
      icon: ShieldCheckIcon,
    },
  ]

  return (
    <nav aria-label="Settings" className="flex md:w-48 md:shrink-0">
      <ul className="flex w-full gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {items.map((item) => {
          const isActive = pathname === item.href

          return (
            <li key={item.href} className="shrink-0 md:w-full">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
