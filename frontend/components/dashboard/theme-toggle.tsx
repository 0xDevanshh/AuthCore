"use client"

import * as React from "react"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

const THEME_CYCLE = ["light", "dark", "system"] as const

const THEME_ICON = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
} as const

const THEME_LABEL = {
  light: "Light",
  dark: "Dark",
  system: "System",
} as const

/**
 * Cycles light → dark → system on each click, rather than a dropdown with
 * three options. One button is the simplest thing that can't break: no
 * Base UI Menu/Group composition to get wrong, no extra click to open before
 * the real choice. The icon itself communicates the current mode.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  /*
   * next-themes cannot know the real theme during SSR (it lives in
   * localStorage, which the server has no access to), so `theme` is
   * undefined on the very first client render too, until the provider's
   * inline script has run. Rendering the real icon before that would mean the
   * server-rendered markup and the first client render disagree — a
   * hydration mismatch. This renders a neutral placeholder for that one
   * instant instead.
   *
   * useSyncExternalStore rather than state-plus-effect: the "subscription"
   * never actually changes, so there is nothing to set up, but this is still
   * the correct primitive for "give a different answer on the server than on
   * the client" — the same pattern used in hooks/use-mobile.ts.
   */
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  const current = mounted
    ? ((theme as (typeof THEME_CYCLE)[number] | undefined) ?? "system")
    : "system"

  const Icon = THEME_ICON[current]

  function handleClick() {
    const nextIndex = (THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length
    setTheme(THEME_CYCLE[nextIndex])
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleClick}
      aria-label={`Theme: ${THEME_LABEL[current]}. Click to change.`}
      className="rounded-full"
    >
      {mounted ? <Icon /> : null}
    </Button>
  )
}
