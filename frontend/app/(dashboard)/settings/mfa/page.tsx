import { redirect } from "next/navigation"

import { routes } from "@/lib/navigation"

/*
 * Superseded by /settings/two-factor, the path this feature was actually
 * built at. Left as a redirect rather than deleted — `rm` is blocked in this
 * workspace — so a stale link or bookmark still lands somewhere real instead
 * of a stub or a 404.
 */
export default function LegacyMfaSettingsRedirect() {
  redirect(routes.settingsMfa)
}
