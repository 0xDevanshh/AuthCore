import { redirect } from "next/navigation"

import { routes } from "@/lib/navigation"

/**
 * `/settings` has no content of its own — Profile is the default section, per
 * the prompt — so this immediately forwards there rather than rendering
 * something and duplicating the sub-nav's own default.
 */
export default function SettingsIndexPage() {
  redirect(routes.settingsProfile)
}
