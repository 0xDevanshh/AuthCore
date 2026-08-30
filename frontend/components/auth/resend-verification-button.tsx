"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { apiClient, getApiErrorMessage } from "@/lib/api-client"

const COOLDOWN_SECONDS = 60

/**
 * Requests a fresh verification email, then locks itself for a minute.
 *
 * The cooldown is a courtesy to the backend's rate limiters
 * (resendVerificationIpLimiter + resendVerificationEmailLimiter), not a
 * security control — it stops an impatient user from burning their allowance on
 * repeat clicks and hitting a 429. The server enforces the real limit.
 *
 * The endpoint answers with one fixed message whether or not the address has an
 * account, so nothing here may branch on the outcome: doing so would turn a
 * deliberately uninformative response into an account-existence oracle.
 */
export function ResendVerificationButton({ email }: { email: string }) {
  const [isSending, setIsSending] = React.useState(false)
  const [secondsLeft, setSecondsLeft] = React.useState(0)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (secondsLeft <= 0) {
      return
    }

    const timer = setTimeout(() => setSecondsLeft((n) => n - 1), 1000)

    return () => clearTimeout(timer)
  }, [secondsLeft])

  async function handleResend() {
    setIsSending(true)
    setError(null)
    setNotice(null)

    try {
      const response = await apiClient.post<{ success: true; message?: string }>(
        "/auth/resend-verification",
        { email },
      )

      // The backend's own generic wording, shown verbatim.
      setNotice(response.data.message ?? "Verification email sent.")
      setSecondsLeft(COOLDOWN_SECONDS)
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Could not resend the email."))
    } finally {
      setIsSending(false)
    }
  }

  const isDisabled = isSending || secondsLeft > 0

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={handleResend}
        disabled={isDisabled}
        aria-live="polite"
      >
        {isSending ? <Spinner /> : null}
        {secondsLeft > 0
          ? `Resend available in ${secondsLeft}s`
          : "Resend verification email"}
      </Button>

      {notice ? (
        <p className="text-xs text-muted-foreground">{notice}</p>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
