"use client"

import * as React from "react"
import { KeyRoundIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { FormErrorAlert } from "@/components/auth/form-error-alert"
import { SecretReveal } from "@/components/dashboard/secret-reveal"
import { apiClient, getApiErrorMessage } from "@/lib/api-client"
import type {
  ApiKeyCreateResponseData,
  ApiKeySummary,
  ApiSuccess,
} from "@/lib/api-types"

/**
 * Two-phase dialog: confirm, then reveal.
 *
 * The reveal replaces the confirm step inside the same open dialog rather than
 * closing and reopening. A close/reopen reads as "the thing finished" and
 * invites a stray click on the backdrop at the exact moment an unrecoverable
 * value is on screen; keeping one dialog open makes the reveal the obvious
 * continuation of the action just taken.
 *
 * There is deliberately no way back to a revealed key. The backend stores only a
 * hash, so a "show again" affordance could not be honoured — offering one would
 * promise something the system cannot do.
 */
export function CreateApiKeyDialog({
  applicationId,
  onCreated,
  trigger,
}: {
  applicationId: string
  /** Lets the table show the new key immediately, without a refetch. */
  onCreated: (apiKey: ApiKeySummary) => void
  trigger: React.ReactElement
}) {
  const [open, setOpen] = React.useState(false)
  const [isCreating, setIsCreating] = React.useState(false)
  const [rawKey, setRawKey] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function handleCreate() {
    setIsCreating(true)
    setError(null)

    try {
      const response = await apiClient.post<
        ApiSuccess<ApiKeyCreateResponseData>
      >(`/applications/${applicationId}/keys`, {})

      const { apiKey, rawKey: secret } = response.data.data

      onCreated(apiKey)
      setRawKey(secret)
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Could not create the key."))
    } finally {
      setIsCreating(false)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    /*
     * While the secret is on screen the dialog is dismissible — the user has
     * been told it will not be shown again, and trapping them would be worse
     * than trusting the warning. Closing simply discards it, which is the whole
     * point of the design.
     */
    setOpen(nextOpen)

    if (!nextOpen) {
      setRawKey(null)
      setError(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />

      <DialogContent
        // No close X during the reveal: the only way out should be the Done
        // button, so dismissing is a decision rather than a reflex.
        showCloseButton={!rawKey}
      >
        {rawKey ? (
          <>
            <DialogHeader>
              <DialogTitle>Your new API key</DialogTitle>
              <DialogDescription>
                Store it somewhere safe, like your deployment&apos;s environment
                variables.
              </DialogDescription>
            </DialogHeader>

            <SecretReveal secret={rawKey} />

            <DialogFooter>
              <DialogClose render={<Button variant="default" />}>
                Done
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Generate a new API key</DialogTitle>
              <DialogDescription>
                This creates a secret key for authenticating requests to this
                application. The key is shown once, immediately after it is
                created, and cannot be retrieved later.
              </DialogDescription>
            </DialogHeader>

            <FormErrorAlert message={error} />

            <DialogFooter>
              <DialogClose
                render={<Button variant="outline" disabled={isCreating} />}
              >
                Cancel
              </DialogClose>

              <Button type="button" onClick={handleCreate} disabled={isCreating}>
                {isCreating ? <Spinner /> : <KeyRoundIcon />}
                Generate key
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
