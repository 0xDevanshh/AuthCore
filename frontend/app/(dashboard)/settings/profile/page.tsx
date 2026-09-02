"use client"

import Link from "next/link"
import { InfoIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { ResendVerificationButton } from "@/components/auth/resend-verification-button"
import { useAuth } from "@/lib/auth-context"
import { routes } from "@/lib/navigation"

/*
 * =============================================================================
 * WHY THESE FIELDS ARE READ-ONLY
 * =============================================================================
 *
 * Checked rather than assumed: `backend/src/services/user.service.ts` exports
 * only `getSafeUser` and `changePassword`, and no route anywhere in
 * `backend/src/routes/` accepts a PATCH or PUT against `/auth/me` or any
 * profile path. There is no endpoint that updates a name or email, so this page
 * does not build a form against one that doesn't exist — every field here is
 * display-only, with a line saying so rather than a save button that would
 * silently do nothing.
 *
 * When that endpoint exists, this becomes a normal react-hook-form page, the
 * same shape as the auth forms in app/(auth)/.
 */

export default function ProfilePage() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <ProfileSkeleton />
  }

  if (!user) {
    // Defensive only — the dashboard has no route guard yet, so a signed-out
    // visitor can reach this page directly. See the note in api-client.ts for
    // why /auth/me does not redirect them away on its own.
    return (
      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            You need to be signed in to view this page.
          </p>
          <Link
            href={routes.login}
            className="text-sm font-medium text-foreground underline underline-offset-4"
          >
            Log in
          </Link>
        </CardContent>
      </Card>
    )
  }

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || null

  return (
    <div className="flex flex-col gap-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>
            Your name and email as they&apos;re stored on your account.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel>Name</FieldLabel>
            <FieldContent>
              <p className="text-sm">
                {fullName ?? (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </p>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>Email</FieldLabel>
            <FieldContent className="gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm">
                  {user.email ?? (
                    <span className="text-muted-foreground">
                      No email on file
                    </span>
                  )}
                </p>

                {user.email ? (
                  <Badge variant={user.emailVerified ? "secondary" : "outline"}>
                    {user.emailVerified ? "Verified" : "Unverified"}
                  </Badge>
                ) : null}
              </div>

              {user.email && !user.emailVerified ? (
                <div className="mt-1">
                  <ResendVerificationButton email={user.email} />
                </div>
              ) : null}
            </FieldContent>
          </Field>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Name and email can&apos;t be changed here yet — the API doesn&apos;t
              have an endpoint for updating them.
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <Skeleton className="h-5 w-20" />
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-56" />
        </div>
      </CardContent>
    </Card>
  )
}
