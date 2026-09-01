"use client"

import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Spinner } from "@/components/ui/spinner"
import { FormErrorAlert } from "@/components/auth/form-error-alert"
import { apiClient, getApiErrorMessage } from "@/lib/api-client"
import type { PendingInvitation } from "@/lib/api-types"

/**
 * Confirmation for revoking a pending invitation.
 *
 * On success the row is dropped rather than relabelled. Unlike a revoked API
 * key — which stays visible because audit entries still refer to it — this
 * table exists to answer "who is still waiting?", and a revoked invitation is
 * no longer waiting. Leaving it in place would make the list answer a different
 * question than its heading promises.
 */
export function RevokeInvitationDialog({
  applicationId,
  invitation,
  onRevoked,
  trigger,
}: {
  applicationId: string
  invitation: PendingInvitation
  onRevoked: (invitationId: string) => void
  trigger: React.ReactElement
}) {
  const [open, setOpen] = React.useState(false)
  const [isRevoking, setIsRevoking] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleRevoke() {
    setIsRevoking(true)
    setError(null)

    try {
      await apiClient.delete(
        `/applications/${applicationId}/invitations/${invitation.id}`,
      )

      onRevoked(invitation.id)
      setOpen(false)
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Could not revoke this invitation."))
    } finally {
      setIsRevoking(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)

        if (!next) {
          setError(null)
        }
      }}
    >
      <AlertDialogTrigger render={trigger} />

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke this invitation?</AlertDialogTitle>
          <AlertDialogDescription>
            The link sent to{" "}
            <span className="font-medium text-foreground">
              {invitation.invitedEmail}
            </span>{" "}
            will stop working. You can invite them again at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <FormErrorAlert message={error} />

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRevoking}>Cancel</AlertDialogCancel>

          <AlertDialogAction
            variant="destructive"
            onClick={handleRevoke}
            disabled={isRevoking}
          >
            {isRevoking ? <Spinner /> : null}
            Revoke invitation
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
