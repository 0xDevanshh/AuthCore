"use client"

import * as React from "react"
import { LayersIcon, PlusIcon, RefreshCwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ApplicationCard } from "@/components/dashboard/application-card"
import { CreateApplicationDialog } from "@/components/dashboard/create-application-dialog"
import { apiClient, getApiErrorMessage } from "@/lib/api-client"
import type { ApiSuccess, Application, ApplicationListResponseData } from "@/lib/api-types"

type ListState =
  | { status: "loading" }
  | { status: "ready"; applications: Application[] }
  | { status: "error"; message: string }

const GRID_CLASSES = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"

export default function ApplicationsPage() {
  const [state, setState] = React.useState<ListState>({ status: "loading" })
  const [isRetrying, setIsRetrying] = React.useState(false)

  /*
   * Returns the next state rather than writing it, which keeps the state
   * updates at the call sites — an effect that calls a setState-containing
   * function can't be checked for cascading renders, and this is the shape that
   * makes the data flow obvious anyway.
   */
  const fetchApplications = React.useCallback(async (): Promise<ListState> => {
    try {
      const response = await apiClient.get<
        ApiSuccess<ApplicationListResponseData>
      >("/applications")

      return {
        status: "ready",
        applications: response.data.data.applications,
      }
    } catch (caught) {
      /*
       * A 401 that survived the client's refresh-and-retry has already sent the
       * user to /login, so this branch is for the cases that leave them here:
       * a network failure, a 5xx, or a 403.
       */
      return {
        status: "error",
        message: getApiErrorMessage(
          caught,
          "We couldn't load your applications.",
        ),
      }
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false

    void (async () => {
      const next = await fetchApplications()

      // Guarded so a response arriving after the user has navigated away does
      // not set state on an unmounted page.
      if (!cancelled) {
        setState(next)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fetchApplications])

  async function handleRetry() {
    setIsRetrying(true)

    try {
      setState(await fetchApplications())
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Applications</h1>
          <p className="text-sm text-muted-foreground">
            Each application is a project you&apos;ve added authentication to.
          </p>
        </div>

        {/*
          * Persistent, not just an empty-state affordance — someone with twenty
          * applications should not have to hunt for how to add the next one.
          */}
        <CreateApplicationDialog
          trigger={
            <Button>
              <PlusIcon />
              New application
            </Button>
          }
        />
      </header>

      {state.status === "loading" ? <ApplicationsSkeleton /> : null}

      {state.status === "error" ? (
        <LoadFailed
          message={state.message}
          isRetrying={isRetrying}
          onRetry={() => void handleRetry()}
        />
      ) : null}

      {state.status === "ready" ? (
        state.applications.length === 0 ? (
          <EmptyState />
        ) : (
          <div className={GRID_CLASSES}>
            {state.applications.map((application) => (
              <ApplicationCard key={application.id} application={application} />
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}

/**
 * Placeholders in the same grid, at the same card proportions, as the real
 * result. A spinner would collapse to nothing and let the content jump into
 * place; this keeps the layout still when the data lands.
 */
function ApplicationsSkeleton() {
  return (
    <div className={GRID_CLASSES} aria-hidden>
      {[0, 1, 2, 3].map((index) => (
        <Card key={index} className="gap-3 shadow-sm" size="sm">
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/**
 * First thing a new developer sees, so it is written as an invitation rather
 * than a report of absence: it says what an application *is* in this product's
 * terms, then offers the one action worth taking.
 */
function EmptyState() {
  return (
    <Card className="items-center gap-4 border-dashed py-12 text-center shadow-sm">
      <CardContent className="flex max-w-sm flex-col items-center gap-3">
        <div
          aria-hidden
          className="flex size-10 items-center justify-center rounded-full bg-secondary"
        >
          <LayersIcon className="size-5 text-muted-foreground" />
        </div>

        <h2 className="text-base font-semibold">
          Create your first application
        </h2>

        <p className="text-sm text-muted-foreground">
          An application represents one project you want to add authentication
          to.
        </p>

        <CreateApplicationDialog
          trigger={
            <Button className="mt-1">
              <PlusIcon />
              Create application
            </Button>
          }
        />
      </CardContent>
    </Card>
  )
}

/**
 * A sentence and a retry, not a stack trace. The underlying message comes from
 * the API's own `message` field, which is written for people.
 */
function LoadFailed({
  message,
  isRetrying,
  onRetry,
}: {
  message: string
  isRetrying: boolean
  onRetry: () => void
}) {
  return (
    <Card className="items-center gap-4 py-12 text-center shadow-sm">
      <CardContent className="flex max-w-sm flex-col items-center gap-3">
        <h2 className="text-base font-semibold">
          Couldn&apos;t load your applications
        </h2>

        <p className="text-sm text-muted-foreground">{message}</p>

        <Button
          variant="outline"
          onClick={onRetry}
          disabled={isRetrying}
          className="mt-1"
        >
          {isRetrying ? <Spinner /> : <RefreshCwIcon />}
          Try again
        </Button>
      </CardContent>
    </Card>
  )
}
