import Link from "next/link"

import { Card } from "@/components/ui/card"
import { AuthBackground } from "@/components/auth/auth-background"

/*
 * Unauthenticated shell: a single floating card centred on a plain white page.
 * Auth pages render only their own contents — the Card, centring and background
 * texture are supplied here.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center px-4 py-10">
      <AuthBackground />

      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 self-center"
        >
          {/* Wordmark placeholder — swap for the real AuthCore mark. */}
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
          >
            A
          </span>
          <span className="text-base font-semibold tracking-tight">
            AuthCore
          </span>
        </Link>

        <Card className="p-2 shadow-lg">{children}</Card>
      </div>
    </div>
  )
}
