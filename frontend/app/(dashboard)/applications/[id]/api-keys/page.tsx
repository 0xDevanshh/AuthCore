"use client"

import * as React from "react"
import { KeyRoundIcon, LockIcon, PlusIcon, RefreshCwIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CreateApiKeyDialog } from "@/components/dashboard/create-api-key-dialog"
import { RevokeApiKeyDialog } from "@/components/dashboard/revoke-api-key-dialog"
import {
  apiClient,
  getApiErrorMessage,
  getApiErrorStatus,
} from "@/lib/api-client"
import type { ApiKeyListResponseData, ApiKeySummary, ApiSuccess } from "@/lib/api-types"
import { formatAbsoluteDate, formatRelativeTime } from "@/lib/format"
import { PERMISSIONS } from "@/lib/permissions"
import { useApplication, usePermission } from "../application-context"

type ListState =
  | { status: "loading" }
  | { status: "ready"; keys: ApiKeySummary[] }
  /** The caller lacks apikey:list, which the endpoint enforces. */
  | { status: "forbidden" }
  | { status: "error"; message: string }

export default function ApiKeysPage() {
  const { application } = useApplication()

  const canCreate = usePermission(PERMISSIONS.APIKEY_CREATE)
  const canRevoke = usePermission(PERMISSIONS.APIKEY_REVOKE)

  const [state, setState] = React.useState<ListState>({ status: "loading" })
  const [isRetrying, setIsRetrying] = React.useState(false)

  const fetchKeys = React.useCallback(async (): Promise<ListState> => {
    try {
      const response = await apiClient.get<ApiSuccess<ApiKeyListResponseData>>(
        `/applications/${application.id}/keys`,
      )

      return { status: "ready", keys: response.data.data.apiKeys }
    } catch (caught) {
      if (getApiErrorStatus(caught) === 403) {
        return { status: "forbidden" }
      }

      return {
        status: "error",
        message: getApiErrorMessage(caught, "We couldn't load this application's keys."),
      }
    }
  }, [application.id])

  React.useEffect(() => {
    let cancelled = false

    void (async () => {
      const next = await fetchKeys()

      if (!cancelled) {
        setState(next)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fetchKeys])

  async function handleRetry() {
    setIsRetrying(true)

    try {
      setState(await fetchKeys())
    } finally {
      setIsRetrying(false)
    }
  }

  /** Newest first, matching the backend's ordering. */
  function handleCreated(apiKey: ApiKeySummary) {
    setState((current) =>
      current.status === "ready"
        ? { status: "ready", keys: [apiKey, ...current.keys] }
        : current,
    )
  }

  /*
   * Revocation is a soft delete: the row stays and its status flips. Removing
   * it would erase the history of a key that may still appear in audit logs.
   */
  function handleRevoked(updated: ApiKeySummary) {
    setState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            keys: current.keys.map((key) =>
              key.id === updated.id ? updated : key,
            ),
          }
        : current,
    )
  }

  if (state.status === "loading") {
    return <ApiKeysSkeleton />
  }

  if (state.status === "forbidden") {
    return (
      <Notice
        icon={<LockIcon className="size-5 text-muted-foreground" />}
        title="You don't have access to API keys"
        message="Your role in this application doesn't include permission to view its API keys."
      />
    )
  }

  if (state.status === "error") {
    return (
      <Notice
        icon={<RefreshCwIcon className="size-5 text-muted-foreground" />}
        title="Couldn't load API keys"
        message={state.message}
        action={
          <Button variant="outline" onClick={() => void handleRetry()} disabled={isRetrying}>
            {isRetrying ? <Spinner /> : <RefreshCwIcon />}
            Try again
          </Button>
        }
      />
    )
  }

  if (state.keys.length === 0) {
    return (
      <Card className="items-center gap-4 border-dashed py-12 text-center shadow-sm">
        <CardContent className="flex max-w-md flex-col items-center gap-3">
          <div
            aria-hidden
            className="flex size-10 items-center justify-center rounded-full bg-secondary"
          >
            <KeyRoundIcon className="size-5 text-muted-foreground" />
          </div>

          <h2 className="text-base font-semibold">Create your first API key</h2>

          <p className="text-sm text-muted-foreground">
            An API key lets your backend authenticate requests to this
            application — you send it in the{" "}
            <code className="font-mono text-xs">X-AuthCore-Key</code> header.
          </p>

          {canCreate ? (
            <CreateApiKeyDialog
              applicationId={application.id}
              onCreated={handleCreated}
              trigger={
                <Button className="mt-1">
                  <PlusIcon />
                  Generate new key
                </Button>
              }
            />
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Your role doesn&apos;t allow creating keys.
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 border-b py-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">API keys</CardTitle>
          <CardDescription>
            Secret keys for authenticating requests to this application.
          </CardDescription>
        </div>

        {canCreate ? (
          <CreateApiKeyDialog
            applicationId={application.id}
            onCreated={handleCreated}
            trigger={
              <Button>
                <PlusIcon />
                Generate new key
              </Button>
            }
          />
        ) : null}
      </CardHeader>

      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
              {canRevoke ? (
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>

          <TableBody>
            {state.keys.map((key) => {
              const isRevoked = key.revokedAt !== null

              return (
                <TableRow key={key.id} data-revoked={isRevoked}>
                  <TableCell className="font-mono text-xs break-all">
                    {key.prefix}
                  </TableCell>

                  <TableCell
                    className="text-sm text-muted-foreground"
                    title={formatAbsoluteDate(key.createdAt)}
                  >
                    {formatRelativeTime(key.createdAt)}
                  </TableCell>

                  <TableCell>
                    {isRevoked ? (
                      <Badge variant="secondary">Revoked</Badge>
                    ) : (
                      <Badge variant="outline">Active</Badge>
                    )}
                  </TableCell>

                  {canRevoke ? (
                    <TableCell className="text-right">
                      {/*
                        * Nothing to revoke on an already-revoked key — the
                        * backend treats a repeat as a no-op, so offering it
                        * would just be a button that does nothing.
                        */}
                      {isRevoked ? null : (
                        <RevokeApiKeyDialog
                          applicationId={application.id}
                          apiKey={key}
                          onRevoked={handleRevoked}
                          trigger={
                            <Button variant="ghost" size="sm">
                              Revoke
                            </Button>
                          }
                        />
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function ApiKeysSkeleton() {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b py-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-8 w-36" />
      </CardHeader>

      <CardContent className="flex flex-col gap-3 py-4">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function Notice({
  icon,
  title,
  message,
  action,
}: {
  icon: React.ReactNode
  title: string
  message: string
  action?: React.ReactNode
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

        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{message}</p>

        {action ? <div className="mt-1">{action}</div> : null}
      </CardContent>
    </Card>
  )
}
