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
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { FormErrorAlert } from "@/components/auth/form-error-alert"
import { RecoveryCodesAcknowledge } from "@/components/dashboard/recovery-codes-acknowledge"
import {
  apiClient,
  getApiErrorMessage,
} from "@/lib/api-client"
import type {
  ApiSuccess,
  MfaRegenerateRecoveryCodesResponseData,
} from "@/lib/api-types"

/**
 * Confirm, then reveal — same AlertDialog root stays open across both, same
 * reasoning as EnableTwoFactorDialog: a close/reopen would read as "finished"
 * at the exact moment a value that can't be recovered appears on screen.
 *
 * Base UI's AlertDialog already blocks backdrop-click dismissal unconditionally
 * (confirmed from `useRenderDialogRoot`'s source: `disablePointerDismissal` is
 * forced true whenever `mode === 'alert-dialog'`, not merely the default). But
 * that alone does not cover Escape, so the reveal phase adds the same explicit
 * `eventDetails.cancel()` guard used in EnableTwoFactorDialog rather than
 * relying on an assumption about which keys the primitive happens to block.
 */
export function RegenerateRecoveryCodesDialog({
  trigger,
}: {
  trigger: React.ReactElement
}) {
  const [open, setOpen] = React.useState(false)
  const [isRegenerating, setIsRegenerating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[] | null>(
    null,
  )
  const [acknowledged, setAcknowledged] = React.useState(false)

  async function handleRegenerate() {
    setIsRegenerating(true)
    setError(null)

    try {
      const response = await apiClient.post<
        ApiSuccess<MfaRegenerateRecoveryCodesResponseData>
      >("/auth/mfa/recovery-codes/regenerate")

      setRecoveryCodes(response.data.data.recoveryCodes)
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Could not regenerate your recovery codes."))
    } finally {
      setIsRegenerating(false)
    }
  }

  function reset() {
    setRecoveryCodes(null)
    setAcknowledged(false)
    setError(null)
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (
          !nextOpen &&
          recoveryCodes &&
          !acknowledged &&
          (eventDetails.reason === "outside-press" ||
            eventDetails.reason === "escape-key")
        ) {
          eventDetails.cancel()
          return
        }

        setOpen(nextOpen)

        if (!nextOpen) {
          reset()
        }
      }}
    >
      <AlertDialogTrigger render={trigger} />

      <AlertDialogContent>
        {recoveryCodes ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Save your new recovery codes</AlertDialogTitle>
              <AlertDialogDescription>
                Your previous codes no longer work.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <RecoveryCodesAcknowledge
              codes={recoveryCodes}
              acknowledged={acknowledged}
              onAcknowledgedChange={setAcknowledged}
              warning="These codes will only be shown once. Save them somewhere safe now — your previous codes have already been replaced."
            />

            <AlertDialogFooter>
              <Button
                type="button"
                disabled={!acknowledged}
                onClick={() => {
                  /*
                   * Both calls are needed: setOpen(false) bypasses the
                   * primitive entirely (it's a direct write to the controlling
                   * state, not a close the primitive detected), so it never
                   * reaches the `onOpenChange` handler above — which is where
                   * `reset()` otherwise lives. Skipping it here would leave
                   * these codes and the checked box in state, so reopening the
                   * dialog next time would show this stale reveal instead of a
                   * fresh confirmation step.
                   */
                  setOpen(false)
                  reset()
                }}
              >
                Done
              </Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Regenerate recovery codes?</AlertDialogTitle>
              <AlertDialogDescription>
                Your existing recovery codes will stop working immediately.
                You&apos;ll get a new set to save.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <FormErrorAlert message={error} />

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isRegenerating}>
                Cancel
              </AlertDialogCancel>

              <AlertDialogAction
                variant="destructive"
                onClick={handleRegenerate}
                disabled={isRegenerating}
              >
                {isRegenerating ? <Spinner /> : null}
                Regenerate codes
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
