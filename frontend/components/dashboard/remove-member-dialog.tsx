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
import type { MemberSummary } from "@/lib/api-types"

/**
 * Confirmation for removing a member.
 *
 * Stays open on failure and surfaces the server's own message verbatim. That
 * matters most for the last-owner guard: the backend answers 400 `LAST_OWNER`
 * with "Cannot remove the last owner of an application", which explains the
 * refusal far better than any generic wording this dialog could substitute.
 */
export function RemoveMemberDialog({
  applicationId,
  member,
  displayName,
  onRemoved,
  trigger,
}: {
  applicationId: string
  member: MemberSummary
  displayName: string
  onRemoved: (membershipId: string) => void
  trigger: React.ReactElement
}) {
  const [open, setOpen] = React.useState(false)
  const [isRemoving, setIsRemoving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleRemove() {
    setIsRemoving(true)
    setError(null)

    try {
      await apiClient.delete(
        `/applications/${applicationId}/members/${member.membershipId}`,
      )

      // The response carries no body, so the row is dropped locally.
      onRemoved(member.membershipId)
      setOpen(false)
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Could not remove this member."))
    } finally {
      setIsRemoving(false)
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
          <AlertDialogTitle>
            Remove {displayName} from this application?
          </AlertDialogTitle>
          <AlertDialogDescription>
            They&apos;ll immediately lose access to this application and
            everything in it. You can invite them again later.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <FormErrorAlert message={error} />

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>

          <AlertDialogAction
            variant="destructive"
            onClick={handleRemove}
            disabled={isRemoving}
          >
            {isRemoving ? <Spinner /> : null}
            Remove member
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
