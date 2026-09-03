"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Spinner } from "@/components/ui/spinner"
import { FormErrorAlert } from "@/components/auth/form-error-alert"
import { RecoveryCodesAcknowledge } from "@/components/dashboard/recovery-codes-acknowledge"
import {
  apiClient,
  getApiErrorCode,
  getApiErrorMessage,
} from "@/lib/api-client"
import type {
  ApiSuccess,
  MfaEnrollResponseData,
  MfaVerifySetupResponseData,
} from "@/lib/api-types"
import {
  verifyTotpSetupSchema,
  type VerifyTotpSetupInput,
} from "@/lib/validation-schemas"

/**
 * The full enable-2FA flow, one dialog across two phases:
 *
 *   confirm — QR code, manual-entry secret, and the 6-digit code that proves
 *             the app was actually set up correctly.
 *   reveal  — the recovery codes verify-setup just generated, gated behind an
 *             explicit "I've saved these" acknowledgment.
 *
 * Kept as one continuously-open dialog rather than closing and reopening
 * between phases, same reasoning as CreateApiKeyDialog in F4.2: a close/reopen
 * reads as "finished" and invites a stray dismissal at the exact moment an
 * unrecoverable value appears.
 *
 * Unlike that dialog, the reveal phase here does not trust a stray dismissal —
 * recovery codes are the only account-recovery path if the authenticator is
 * lost, so both the close button and Escape/backdrop dismissal are disabled
 * until the checkbox is checked. See `handleOpenChange`.
 */
export function EnableTwoFactorDialog({
  open,
  enrollment,
  onOpenChange,
  onEnabled,
}: {
  open: boolean
  /** Null only when `open` is false; the parent always supplies data when opening. */
  enrollment: MfaEnrollResponseData | null
  onOpenChange: (open: boolean) => void
  onEnabled: () => void
}) {
  /*
   * Seeded from the prop and replaced only by `handleStartOver`. The parent
   * remounts this component (via the `key` prop at the call site) for every
   * new enrollment, so this initial value is never stale — there is no case
   * where the prop changes under an already-mounted instance.
   */
  const [currentEnrollment, setCurrentEnrollment] =
    React.useState(enrollment)
  const [phase, setPhase] = React.useState<"confirm" | "reveal">("confirm")
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[] | null>(
    null,
  )
  const [acknowledged, setAcknowledged] = React.useState(false)
  const [confirmError, setConfirmError] = React.useState<string | null>(null)
  const [setupExpired, setSetupExpired] = React.useState(false)
  const [isStartingOver, setIsStartingOver] = React.useState(false)
  const [secretCopied, setSecretCopied] = React.useState(false)

  const form = useForm<VerifyTotpSetupInput>({
    resolver: zodResolver(verifyTotpSetupSchema),
    defaultValues: { code: "" },
  })

  async function handleCopySecret() {
    if (!currentEnrollment) {
      return
    }

    try {
      await navigator.clipboard.writeText(currentEnrollment.secret)
      setSecretCopied(true)
      setTimeout(() => setSecretCopied(false), 2500)
    } catch {
      // No fallback message here: the code is already visible and selectable
      // in the block below, which is the manual-entry path anyway.
    }
  }

  async function handleStartOver() {
    setIsStartingOver(true)
    setConfirmError(null)
    setSetupExpired(false)

    try {
      const response = await apiClient.post<ApiSuccess<MfaEnrollResponseData>>(
        "/auth/mfa/totp/enroll",
      )

      setCurrentEnrollment(response.data.data)
      form.reset({ code: "" })
    } catch (caught) {
      setConfirmError(
        getApiErrorMessage(caught, "Could not start over. Try closing this and beginning again."),
      )
    } finally {
      setIsStartingOver(false)
    }
  }

  async function onSubmitCode(values: VerifyTotpSetupInput) {
    setConfirmError(null)
    setSetupExpired(false)

    try {
      const response = await apiClient.post<
        ApiSuccess<MfaVerifySetupResponseData>
      >("/auth/mfa/totp/verify-setup", values)

      setRecoveryCodes(response.data.data.recoveryCodes)
      setPhase("reveal")
    } catch (caught) {
      const code = getApiErrorCode(caught)

      if (code === "MFA_NO_PENDING_SETUP") {
        // The pending secret this code would confirm no longer exists (the
        // enrollment window lapsed, or it was superseded). No code entered
        // here can ever succeed against it — the fix is a fresh QR, not a
        // retry, so this is surfaced distinctly from a simple wrong code.
        setSetupExpired(true)
        return
      }

      // MFA_INVALID_CODE and anything else: a retry against the same pending
      // secret can still succeed, so the QR and secret stay on screen.
      setConfirmError(
        getApiErrorMessage(caught, "That code was not accepted. Try again."),
      )
      form.reset({ code: "" })
    }
  }

  /**
   * The single gate on every way this dialog can close.
   *
   * Blocked, not just discouraged, when an Escape or backdrop click arrives
   * during the reveal phase before the checkbox is checked: recovery codes are
   * the only way back into the account if the authenticator is lost, so an
   * accidental dismissal must not be the thing that loses them.
   * `eventDetails.cancel()` is Base UI's real API for this — confirmed from
   * the dialog root's type definitions, not guessed.
   */
  function handleDialogOpenChange(
    nextOpen: boolean,
    eventDetails: { reason: string; cancel: () => void },
  ) {
    if (
      !nextOpen &&
      phase === "reveal" &&
      !acknowledged &&
      (eventDetails.reason === "outside-press" ||
        eventDetails.reason === "escape-key")
    ) {
      eventDetails.cancel()
      return
    }

    onOpenChange(nextOpen)

    if (!nextOpen && phase === "reveal" && acknowledged) {
      onEnabled()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        // No X during the reveal phase — the checkbox-gated Done button below
        // is the only way out, so leaving is a decision, not a reflex.
        showCloseButton={phase !== "reveal"}
      >
        {phase === "confirm" ? (
          <>
            <DialogHeader>
              <DialogTitle>Set up two-factor authentication</DialogTitle>
              <DialogDescription>
                Scan the QR code with your authenticator app, then enter the
                6-digit code it shows to confirm setup.
              </DialogDescription>
            </DialogHeader>

            {currentEnrollment ? (
              <div className="flex flex-col items-center gap-3">
                {/*
                  * A plain <img>, not next/image: this is a server-generated
                  * data: URI, not a remote asset next/image's loader and
                  * optimization pipeline are built for.
                  */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentEnrollment.qrCodeDataUrl}
                  alt="QR code for two-factor authentication setup"
                  width={180}
                  height={180}
                  className="rounded-lg border border-border"
                />

                <div className="flex w-full flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground">
                    Can&apos;t scan? Enter this code manually.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded-lg border border-border bg-panel px-2.5 py-1.5 font-mono text-xs select-all">
                      {currentEnrollment.secret}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      onClick={handleCopySecret}
                      aria-label={secretCopied ? "Copied" : "Copy code"}
                    >
                      {secretCopied ? <CheckIcon /> : <CopyIcon />}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {setupExpired ? (
              <FormErrorAlert
                title="This setup session expired"
                message="Start over to get a new QR code and secret."
              >
                <div className="mt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleStartOver}
                    disabled={isStartingOver}
                  >
                    {isStartingOver ? <Spinner /> : null}
                    Start over
                  </Button>
                </div>
              </FormErrorAlert>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitCode)} noValidate>
                  <FieldGroup>
                    <FormErrorAlert message={confirmError} />

                    <FormField
                      control={form.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem className="items-center">
                          <FormLabel>Authentication code</FormLabel>
                          <FormControl>
                            <InputOTP
                              maxLength={6}
                              autoFocus
                              value={field.value}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              onComplete={() =>
                                form.handleSubmit(onSubmitCode)()
                              }
                            >
                              <InputOTPGroup>
                                {[0, 1, 2, 3, 4, 5].map((index) => (
                                  <InputOTPSlot key={index} index={index} />
                                ))}
                              </InputOTPGroup>
                            </InputOTP>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <DialogClose
                        render={
                          <Button
                            variant="outline"
                            disabled={form.formState.isSubmitting}
                          />
                        }
                      >
                        Cancel
                      </DialogClose>

                      <Button
                        type="submit"
                        disabled={form.formState.isSubmitting}
                      >
                        {form.formState.isSubmitting ? <Spinner /> : null}
                        Verify and enable
                      </Button>
                    </DialogFooter>
                  </FieldGroup>
                </form>
              </Form>
            )}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Save your recovery codes</DialogTitle>
              <DialogDescription>
                Two-factor authentication is now enabled. If you lose access to
                your authenticator app, these codes are the only way back in.
              </DialogDescription>
            </DialogHeader>

            <RecoveryCodesAcknowledge
              codes={recoveryCodes ?? []}
              acknowledged={acknowledged}
              onAcknowledgedChange={setAcknowledged}
            />

            <DialogFooter>
              <Button
                type="button"
                disabled={!acknowledged}
                onClick={() =>
                  handleDialogOpenChange(false, {
                    reason: "close-press",
                    cancel: () => {},
                  })
                }
              >
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
