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
import type {
  ApiKeyRevokeResponseData,
  ApiKeySummary,
  ApiSuccess,
} from "@/lib/api-types"

/**
 * Confirmation for revoking a key.
 *
 * An AlertDialog rather than `confirm()`: this is destructive and takes effect
 * immediately for every caller using the key, so it deserves a description of
 * the consequence, not a browser chrome yes/no with no room to explain.
 *
 * Stays open while the request is in flight and on failure, so an error is read
 * in the context of the thing that failed.
 */
export function RevokeApiKeyDialog({
  applicationId,
  apiKey,
  onRevoked,
  trigger,
}: {
  applicationId: string
  apiKey: ApiKeySummary
  onRevoked: (updated: ApiKeySummary) => void
  trigger: React.ReactElement
}) {
  const [open, setOpen] = React.useState(false)
  const [isRevoking, setIsRevoking] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleRevoke() {
    setIsRevoking(true)
    setError(null)

    try {
      const response = await apiClient.delete<
        ApiSuccess<ApiKeyRevokeResponseData>
      >(`/applications/${applicationId}/keys/${apiKey.id}`)

      // The response carries the updated row, so the table can be corrected
      // from the server's own answer rather than a guess about what changed.
      onRevoked(response.data.data.apiKey)
      setOpen(false)
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Could not revoke the key."))
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
          <AlertDialogTitle>Revoke this key?</AlertDialogTitle>
          <AlertDialogDescription>
            Any requests using it will immediately stop working. This cannot be
            undone — you&apos;ll need to generate a new key to replace it.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <p className="rounded-lg border border-border bg-panel px-3 py-2 font-mono text-xs break-all">
          {apiKey.prefix}
        </p>

        <FormErrorAlert message={error} />

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRevoking}>Cancel</AlertDialogCancel>

          <AlertDialogAction
            variant="destructive"
            onClick={handleRevoke}
            disabled={isRevoking}
          >
            {isRevoking ? <Spinner /> : null}
            Revoke key
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
