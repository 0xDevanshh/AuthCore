"use client"

import * as React from "react"
import { LockIcon, MailPlusIcon, RefreshCwIcon } from "lucide-react"

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
import { InviteMemberDialog } from "@/components/dashboard/invite-member-dialog"
import { RevokeInvitationDialog } from "@/components/dashboard/revoke-invitation-dialog"
import {
  apiClient,
  getApiErrorMessage,
  getApiErrorStatus,
} from "@/lib/api-client"
import type {
  ApiSuccess,
  InvitationListResponseData,
  PendingInvitation,
} from "@/lib/api-types"
import { useAuth } from "@/lib/auth-context"
import { formatAbsoluteDate, formatRelativeTime } from "@/lib/format"
import { PERMISSIONS } from "@/lib/permissions"
import { useApplication, usePermission } from "../application-context"

type ListState =
  | { status: "loading" }
  | { status: "ready"; invitations: PendingInvitation[] }
  | { status: "forbidden" }
  | { status: "error"; message: string }

export default function InvitationsPage() {
  const { application } = useApplication()
  const { user } = useAuth()

  /*
   * One permission governs the whole tab: the backend gates list, create and
   * revoke on member:invite alike (invitation.routes.ts).
   */
  const canInvite = usePermission(PERMISSIONS.MEMBER_INVITE)

  const [state, setState] = React.useState<ListState>({ status: "loading" })
  const [isRetrying, setIsRetrying] = React.useState(false)

  /*
   * Captured once rather than read during render: `Date.now()` in the render
   * path is impure and would give a different answer on every re-render. An
   * "expires soon" hint does not need to tick in real time.
   */
  const [now] = React.useState(() => Date.now())

  const fetchInvitations = React.useCallback(async (): Promise<ListState> => {
    try {
      const response = await apiClient.get<
        ApiSuccess<InvitationListResponseData>
      >(`/applications/${application.id}/invitations`)

      return { status: "ready", invitations: response.data.data.invitations }
    } catch (caught) {
      if (getApiErrorStatus(caught) === 403) {
        return { status: "forbidden" }
      }

      return {
        status: "error",
        message: getApiErrorMessage(
          caught,
          "We couldn't load this application's invitations.",
        ),
      }
    }
  }, [application.id])

  React.useEffect(() => {
    let cancelled = false

    void (async () => {
      const next = await fetchInvitations()

      if (!cancelled) {
        setState(next)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fetchInvitations])

  async function handleRetry() {
    setIsRetrying(true)

    try {
      setState(await fetchInvitations())
    } finally {
      setIsRetrying(false)
    }
  }

  const reload = React.useCallback(async () => {
    setState(await fetchInvitations())
  }, [fetchInvitations])

  function handleRevoked(invitationId: string) {
    setState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            invitations: current.invitations.filter(
              (invitation) => invitation.id !== invitationId,
            ),
          }
        : current,
    )
  }

  if (state.status === "loading") {
    return <InvitationsSkeleton />
  }

  if (state.status === "forbidden") {
    return (
      <Notice
        icon={<LockIcon className="size-5 text-muted-foreground" />}
        title="You don't have access to invitations"
        message="Your role in this application doesn't include permission to invite members."
      />
    )
  }

  if (state.status === "error") {
    return (
      <Notice
        icon={<RefreshCwIcon className="size-5 text-muted-foreground" />}
        title="Couldn't load invitations"
        message={state.message}
        action={
          <Button
            variant="outline"
            onClick={() => void handleRetry()}
            disabled={isRetrying}
          >
            {isRetrying ? <Spinner /> : <RefreshCwIcon />}
            Try again
          </Button>
        }
      />
    )
  }

  const inviteButton = canInvite ? (
    <InviteMemberDialog
      applicationId={application.id}
      pendingInvitations={state.invitations}
      onInvited={reload}
      trigger={
        <Button>
          <MailPlusIcon />
          Invite member
        </Button>
      }
    />
  ) : null

  if (state.invitations.length === 0) {
    return (
      <Card className="items-center gap-4 border-dashed py-12 text-center shadow-sm">
        <CardContent className="flex max-w-md flex-col items-center gap-3">
          <div
            aria-hidden
            className="flex size-10 items-center justify-center rounded-full bg-secondary"
          >
            <MailPlusIcon className="size-5 text-muted-foreground" />
          </div>

          <h2 className="text-base font-semibold">No pending invitations</h2>

          <p className="text-sm text-muted-foreground">
            Invite someone by email to give them access to this application.
            They&apos;ll appear here until they accept.
          </p>

          {inviteButton ? (
            <div className="mt-1">{inviteButton}</div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Your role doesn&apos;t allow inviting members.
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
          <CardTitle className="text-base">Pending invitations</CardTitle>
          <CardDescription>
            People who have been invited but haven&apos;t joined yet.
          </CardDescription>
        </div>

        {inviteButton}
      </CardHeader>

      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Invited by</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Expires</TableHead>
              {canInvite ? (
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>

          <TableBody>
            {state.invitations.map((invitation) => {
              const expiresAt = new Date(invitation.expiresAt)
              const isExpiringSoon =
                expiresAt.getTime() - now < 24 * 60 * 60 * 1000

              return (
                <TableRow key={invitation.id}>
                  <TableCell className="text-sm font-medium break-all">
                    {invitation.invitedEmail}
                  </TableCell>

                  <TableCell>
                    <Badge variant="secondary">{invitation.roleName}</Badge>
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {/*
                      * Only a userId is available — there is no user lookup on
                      * this backend, the same gap the Members tab documents.
                      */}
                    {invitation.invitedBy === user?.id ? (
                      "You"
                    ) : (
                      <span className="font-mono text-xs">
                        {invitation.invitedBy}
                      </span>
                    )}
                  </TableCell>

                  <TableCell
                    className="text-sm text-muted-foreground"
                    title={formatAbsoluteDate(invitation.createdAt)}
                  >
                    {formatRelativeTime(invitation.createdAt)}
                  </TableCell>

                  <TableCell
                    className={
                      isExpiringSoon
                        ? "text-sm text-destructive"
                        : "text-sm text-muted-foreground"
                    }
                    title={formatAbsoluteDate(invitation.expiresAt)}
                  >
                    {formatRelativeTime(invitation.expiresAt)}
                  </TableCell>

                  {canInvite ? (
                    <TableCell className="text-right">
                      <RevokeInvitationDialog
                        applicationId={application.id}
                        invitation={invitation}
                        onRevoked={handleRevoked}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Revoke
                          </Button>
                        }
                      />
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

function InvitationsSkeleton() {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b py-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-32" />
      </CardHeader>

      <CardContent className="flex flex-col gap-4 py-4">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-center gap-4">
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="ml-auto h-4 w-24" />
            <Skeleton className="h-4 w-24" />
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
