"use client"

import * as React from "react"
import { InfoIcon, LockIcon, RefreshCwIcon, UsersIcon } from "lucide-react"

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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { MemberAvatar } from "@/components/dashboard/member-avatar"
import { RemoveMemberDialog } from "@/components/dashboard/remove-member-dialog"
import {
  apiClient,
  getApiErrorMessage,
  getApiErrorStatus,
} from "@/lib/api-client"
import type { ApiSuccess, MemberListResponseData, MemberSummary } from "@/lib/api-types"
import { useAuth } from "@/lib/auth-context"
import { formatAbsoluteDate, formatRelativeTime } from "@/lib/format"
import { PERMISSIONS, ROLE_NAMES, primaryRole } from "@/lib/permissions"
import { useApplication, usePermission } from "../application-context"

/*
 * =============================================================================
 * TWO BACKEND GAPS SHAPE THIS PAGE
 * =============================================================================
 *
 * Both were checked against the backend, not assumed.
 *
 * 1. THE MEMBERS LIST CARRIES NO IDENTITY.
 *
 *    `MemberSummary` (backend/src/services/member.service.ts) is
 *    `{ membershipId, userId, status, roles, joinedAt }` — no name, no email,
 *    no avatarUrl — and nothing else maps a userId to a user: there is no
 *    GET /users/:id, and /auth/me returns only the caller. So every row except
 *    the signed-in user's own can be identified by nothing but an opaque cuid,
 *    and the avatar has no name to take initials from.
 *
 *    Fix: add the user's name and primary email to the `listMembers` select and
 *    to MemberSummary. The table and MemberAvatar already prefer a display name
 *    whenever one is available, so only the type and this file's `displayName`
 *    line would change.
 *
 * 2. ROLE IDS ARE NOT DISCOVERABLE, SO THE ROLE CANNOT BE EDITED.
 *
 *    PATCH /applications/:id/members/:membershipId/role requires
 *    `{ roleId }`, and `updateMembershipRole` looks the role up by id
 *    (`role.findFirst({ id: roleId, applicationId })`) — a role *name* is
 *    rejected with 400 ROLE_APPLICATION_MISMATCH. But no endpoint lists an
 *    application's roles: `listMembers` returns role names only, and the one
 *    place role ids surface is `listPendingInvitations`, which covers only
 *    roles that happen to have an outstanding invitation and is gated on a
 *    different permission. There is therefore no set of ids to populate a
 *    Select with, so the role renders as a Badge for everyone.
 *
 *    Fix: add GET /applications/:id/roles returning `{ id, name }[]`. The role
 *    cell then becomes a Select over that list, and the PATCH call is the
 *    handler described in the prompt.
 */

type ListState =
  | { status: "loading" }
  | { status: "ready"; members: MemberSummary[] }
  | { status: "forbidden" }
  | { status: "error"; message: string }

export default function MembersPage() {
  const { application } = useApplication()
  const { user } = useAuth()

  const canRemove = usePermission(PERMISSIONS.MEMBER_REMOVE)
  const canUpdateRole = usePermission(PERMISSIONS.MEMBER_ROLE_UPDATE)

  const [state, setState] = React.useState<ListState>({ status: "loading" })
  const [isRetrying, setIsRetrying] = React.useState(false)

  const fetchMembers = React.useCallback(async (): Promise<ListState> => {
    try {
      const response = await apiClient.get<ApiSuccess<MemberListResponseData>>(
        `/applications/${application.id}/members`,
      )

      return { status: "ready", members: response.data.data.members }
    } catch (caught) {
      if (getApiErrorStatus(caught) === 403) {
        return { status: "forbidden" }
      }

      return {
        status: "error",
        message: getApiErrorMessage(caught, "We couldn't load this application's members."),
      }
    }
  }, [application.id])

  React.useEffect(() => {
    let cancelled = false

    void (async () => {
      const next = await fetchMembers()

      if (!cancelled) {
        setState(next)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fetchMembers])

  async function handleRetry() {
    setIsRetrying(true)

    try {
      setState(await fetchMembers())
    } finally {
      setIsRetrying(false)
    }
  }

  function handleRemoved(membershipId: string) {
    setState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            members: current.members.filter(
              (member) => member.membershipId !== membershipId,
            ),
          }
        : current,
    )
  }

  if (state.status === "loading") {
    return <MembersSkeleton />
  }

  if (state.status === "forbidden") {
    return (
      <Notice
        icon={<LockIcon className="size-5 text-muted-foreground" />}
        title="You don't have access to members"
        message="Your role in this application doesn't include permission to view its members."
      />
    )
  }

  if (state.status === "error") {
    return (
      <Notice
        icon={<RefreshCwIcon className="size-5 text-muted-foreground" />}
        title="Couldn't load members"
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

  if (state.members.length === 0) {
    return (
      <Notice
        icon={<UsersIcon className="size-5 text-muted-foreground" />}
        title="No members yet"
        message="Invite someone from the Invitations tab to give them access to this application."
      />
    )
  }

  /*
   * Mirrors `isLastOwner` in member.service.ts: a membership is the last owner
   * when it holds the Owner role and it is the only ACTIVE membership that
   * does. Computed here so the guard is explained up front, in a disabled
   * control with a reason, rather than discovered through a 400.
   */
  const activeOwnerCount = state.members.filter(
    (member) =>
      member.status === "ACTIVE" && member.roles.includes(ROLE_NAMES.OWNER),
  ).length

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-0 py-0 shadow-sm">
        <CardHeader className="flex-col items-start gap-1 border-b py-4">
          <CardTitle className="text-base">Members</CardTitle>
          <CardDescription>
            People with access to this application.
          </CardDescription>
        </CardHeader>

        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                {canRemove ? (
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>

            <TableBody>
              {state.members.map((member) => {
                const isSelf = user?.id === member.userId

                const isLastOwner =
                  member.status === "ACTIVE" &&
                  member.roles.includes(ROLE_NAMES.OWNER) &&
                  activeOwnerCount === 1

                /*
                 * Only the signed-in user's own name is available — see the
                 * note below the table. Everyone else is identified by id.
                 */
                const displayName = isSelf
                  ? [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
                    user?.email ||
                    member.userId
                  : member.userId

                return (
                  <TableRow key={member.membershipId}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <MemberAvatar
                          displayName={isSelf ? displayName : null}
                          userId={member.userId}
                        />

                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1.5 text-sm font-medium">
                            {isSelf ? (
                              <>
                                {displayName}
                                <span className="text-muted-foreground">
                                  (You)
                                </span>
                              </>
                            ) : (
                              <span className="font-mono text-xs">
                                {member.userId}
                              </span>
                            )}
                          </span>

                          {isSelf && user?.email ? (
                            <span className="text-xs text-muted-foreground">
                              {user.email}
                            </span>
                          ) : null}

                          {member.status !== "ACTIVE" ? (
                            <span className="text-xs text-muted-foreground">
                              {member.status.toLowerCase()}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <RoleCell roles={member.roles} />
                    </TableCell>

                    <TableCell
                      className="text-sm text-muted-foreground"
                      title={formatAbsoluteDate(member.joinedAt)}
                    >
                      {formatRelativeTime(member.joinedAt)}
                    </TableCell>

                    {canRemove ? (
                      <TableCell className="text-right">
                        {isLastOwner ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                // A disabled button swallows pointer events, so
                                // the tooltip is anchored to a wrapper instead.
                                <span className="inline-block" />
                              }
                            >
                              <Button variant="ghost" size="sm" disabled>
                                Remove
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {isSelf
                                ? "You're the only owner. Make someone else an owner before removing yourself."
                                : "This is the only owner. An application must always have one."}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <RemoveMemberDialog
                            applicationId={application.id}
                            member={member}
                            displayName={isSelf ? "yourself" : displayName}
                            onRemoved={handleRemoved}
                            trigger={
                              <Button variant="ghost" size="sm">
                                Remove
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

      {canUpdateRole ? <RoleChangeUnavailableNote /> : null}
    </div>
  )
}

function RoleCell({ roles }: { roles: string[] }) {
  const label = primaryRole(roles)

  if (!label) {
    return <span className="text-sm text-muted-foreground">No role</span>
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant={label === ROLE_NAMES.OWNER ? "default" : "secondary"}>
        {label}
      </Badge>

      {roles.length > 1 ? (
        <span className="text-xs text-muted-foreground">
          +{roles.length - 1}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Explains why the role is a badge rather than an editable control, for the one
 * audience that would otherwise wonder: someone who *does* hold
 * member:role_update and expects to be able to use it.
 */
function RoleChangeUnavailableNote() {
  return (
    <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
      <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>
        Changing a member&apos;s role isn&apos;t available yet. The API needs a
        role id, and no endpoint currently lists the roles for an application —
        see the note in this page&apos;s source.
      </span>
    </p>
  )
}

function MembersSkeleton() {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="flex-col items-start gap-1 border-b py-4">
        <Skeleton className="h-5 w-24" />
      </CardHeader>

      <CardContent className="flex flex-col gap-4 py-4">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="ml-auto h-5 w-16" />
            <Skeleton className="h-4 w-20" />
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
