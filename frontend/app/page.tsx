"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/lib/auth-context"
import { routes } from "@/lib/navigation"

/**
 * `/` has no content of its own — this product has no marketing site in
 * scope, only the dashboard and its auth pages. Auth state is only knowable
 * client-side (the session lives in an httpOnly cookie, resolved by
 * AuthProvider's /auth/me check), so this waits for that to settle and then
 * sends the visitor to the page that actually matters for them.
 */
export default function Home() {
  const router = useRouter()
  const { isLoading, isAuthenticated } = useAuth()

  React.useEffect(() => {
    if (isLoading) {
      return
    }

    router.replace(isAuthenticated ? routes.applications : routes.login)
  }, [isLoading, isAuthenticated, router])

  return (
    <div className="flex flex-1 items-center justify-center">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  )
}
