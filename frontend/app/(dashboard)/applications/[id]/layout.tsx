"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeftIcon, LockIcon, SearchXIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  apiClient,
  getApiErrorMessage,
  getApiErrorStatus,
} from "@/lib/api-client"
import type { ApiSuccess, Application, ApplicationResponseData } from "@/lib/api-types"
import { useAuth } from "@/lib/auth-context"
import { routes } from "@/lib/navigation"
import {
  resolveApplicationRole,
  type ResolvedRole,
} from "@/lib/resolve-application-role"
import {
  ApplicationProvider,
  type ApplicationContextValue,
} from "./application-context"
import { ApplicationTabs } from "./application-tabs"

type LoadState =
  | { status: "loading" }
  | { status: "ready"; application: Application; role: ResolvedRole }
  | { status: "forbidden" }
  | { status: "notFound" }
  | { status: "error"; message: string }

export default function ApplicationLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const params = useParams<{ id: string }>()
  const applicationId = params.id

  const { user } = useAuth()
  const currentUserId = user?.id ?? null

  const [state, setState] = React.useState<LoadState>({ status: "loading" })

  /*
   * Returns the next state instead of writing it, so the effect below owns
   * every state transition — see the same shape on the applications list.
   */
  const fetchApplication = React.useCallback(async (): Promise<LoadState> => {
    try {
      const response = await apiClient.get<
        ApiSuccess<ApplicationResponseData>
      >(`/applications/${applicationId}`)

      const application = response.data.data.application

      /*
       * Resolved after the application loads rather than in parallel: the role
       * lookup needs `ownerId` for its fallback, and a 404 should not fire a
       * members request for an application that does not exist.
       */
      const role = await resolveApplicationRole(application, currentUserId)

      return { status: "ready", application, role }
    } catch (caught) {
      const status = getApiErrorStatus(caught)

      // The backend is careful about these two: an id that does not exist is a
      // 404, a real application you are not a member of is a 403.
      if (status === 404) {
        return { status: "notFound" }
      }

      if (status === 403) {
        return { status: "forbidden" }
      }

      return {
        status: "error",
        message: getApiErrorMessage(caught, "We couldn't load this application."),
      }
    }
  }, [applicationId, currentUserId])

  React.useEffect(() => {
    let cancelled = false

    void (async () => {
      const next = await fetchApplication()

      if (!cancelled) {
        setState(next)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fetchApplication])

  const reload = React.useCallback(async () => {
    setState(await fetchApplication())
  }, [fetchApplication])

  if (state.status === "loading") {
    return <ApplicationShellSkeleton />
  }

  if (state.status === "notFound") {
    return (
      <AccessProblem
        icon={<SearchXIcon className="size-5 text-muted-foreground" />}
        title="Application not found"
        message="This application doesn't exist, or it has been deleted."
      />
    )
  }

  if (state.status === "forbidden") {
    return (
      <AccessProblem
        icon={<LockIcon className="size-5 text-muted-foreground" />}
        title="You don't have access"
        message="You're not a member of this application. Ask one of its owners to invite you."
      />
    )
  }

  if (state.status === "error") {
    return (
      <AccessProblem
        icon={<SearchXIcon className="size-5 text-muted-foreground" />}
        title="Couldn't load this application"
        message={state.message}
      />
    )
  }

  return (
    <ApplicationShell
      application={state.application}
      role={state.role}
      reload={reload}
    >
      {children}
    </ApplicationShell>
  )
}

/**
 * The resolved shell. Split out so the context value is built where the
 * Application is definitely present, rather than behind a non-null assertion.
 */
function ApplicationShell({
  application,
  role,
  reload,
  children,
}: {
  application: Application
  role: ResolvedRole
  reload: () => Promise<void>
  children: React.ReactNode
}) {
  const value = React.useMemo<ApplicationContextValue>(
    () => ({
      application,
      role: role.role,
      roles: role.roles,
      permissions: role.permissions,
      isRoleKnown: role.isRoleKnown,
      reload,
    }),
    [application, role, reload],
  )

  return (
    <ApplicationProvider value={value}>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-4">
          <Link
            href={routes.applications}
            className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            All applications
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {application.name}
            </h1>

            {/*
              * Shown rather than tucked away: which actions appear on the other
              * tabs depends on this, so seeing "Member" here explains why the
              * revoke button is missing before anyone goes looking for it.
              */}
            {role.role ? <Badge variant="secondary">{role.role}</Badge> : null}

            {application.status !== "ACTIVE" ? (
              <Badge variant="destructive">
                {application.status === "SUSPENDED" ? "Suspended" : "Deleted"}
              </Badge>
            ) : null}
          </div>

          <ApplicationTabs applicationId={application.id} />
        </header>

        {children}
      </div>
    </ApplicationProvider>
  )
}

function ApplicationShellSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-9 w-full max-w-md" />
      </header>

      <Card className="shadow-sm">
        <CardContent className="flex flex-col gap-3 py-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

function AccessProblem({
  icon,
  title,
  message,
}: {
  icon: React.ReactNode
  title: string
  message: string
}) {
  return (
    <Card className="items-center gap-4 py-12 text-center shadow-sm">
      <CardContent className="flex max-w-sm flex-col items-center gap-3">
        <div
          aria-hidden
          className="flex size-10 items-center justify-center rounded-full bg-secondary"
        >
          {icon}
        </div>

        <h1 className="text-base font-semibold">{title}</h1>

        <p className="text-sm text-muted-foreground">{message}</p>

        <Button
          variant="outline"
          className="mt-1"
          render={<Link href={routes.applications} />}
        >
          <ArrowLeftIcon />
          Back to applications
        </Button>
      </CardContent>
    </Card>
  )
}
