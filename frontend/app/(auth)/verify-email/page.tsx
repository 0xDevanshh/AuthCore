"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { CircleCheckIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { FormErrorAlert } from "@/components/auth/form-error-alert"
import { ResendVerificationButton } from "@/components/auth/resend-verification-button"
import {
  apiClient,
  getApiErrorCode,
  getApiErrorMessage,
  isMissingApiKeyError,
} from "@/lib/api-client"
import { routes } from "@/lib/navigation"

type Outcome =
  | { status: "verifying" }
  | { status: "verified" }
  | { status: "failed"; message: string; canResend: boolean }

/**
 * One message per failure mode, from verification.service.ts. A single "link is
 * invalid" for all of them would be actively unhelpful: "already used" means the
 * user is finished and should just log in, while "expired" means they need a new
 * email — opposite next steps.
 *
 * `canResend` marks the cases a new email actually fixes. Offering a resend on
 * an already-used link would send someone chasing a second email they do not
 * need.
 */
const FAILURE_CASES: Record<
  string,
  { message: string; canResend: boolean }
> = {
  VERIFICATION_TOKEN_NOT_FOUND: {
    message:
      "This verification link is not valid. It may have been altered in transit — try copying the full link from your email, or request a new one below.",
    canResend: true,
  },
  VERIFICATION_TOKEN_EXPIRED: {
    message:
      "This verification link has expired. Request a new one below and we'll email you a fresh link.",
    canResend: true,
  },
  VERIFICATION_TOKEN_ALREADY_USED: {
    message:
      "This verification link has already been used. Your email address is confirmed — you can go ahead and log in.",
    canResend: false,
  },
  VERIFICATION_EMAIL_MISSING: {
    message:
      "The address this link was sent to is no longer on the account. Log in and add the address again to verify it.",
    canResend: false,
  },
}

function VerifyEmail() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  /*
   * A missing token is knowable at render time — there is nothing to
   * synchronise with the server — so it is the initial state rather than
   * something an effect discovers and then re-renders to report.
   */
  const [outcome, setOutcome] = React.useState<Outcome>(() =>
    token
      ? { status: "verifying" }
      : {
          status: "failed",
          message:
            "This page needs a verification link from your email. Open the link from the message we sent you.",
          canResend: true,
        },
  )

  /*
   * Verification is a one-shot side effect on mount. The guard matters: React
   * runs effects twice in development, and without it the second call would
   * consume the freshly-used token and report "already used" on a link that had
   * in fact just succeeded.
   */
  const hasRun = React.useRef(false)

  React.useEffect(() => {
    if (hasRun.current) {
      return
    }

    if (!token) {
      return
    }

    hasRun.current = true

    void (async () => {
      try {
        await apiClient.post("/auth/verify-email", { token })
        setOutcome({ status: "verified" })
      } catch (caught) {
        const code = getApiErrorCode(caught)
        const known = code ? FAILURE_CASES[code] : undefined

        if (known) {
          setOutcome({
            status: "failed",
            message: known.message,
            canResend: known.canResend,
          })

          return
        }

        setOutcome({
          status: "failed",
          message: isMissingApiKeyError(caught)
            ? "This AuthCore instance is not accepting email verification yet. See the note in lib/api-client.ts."
            : getApiErrorMessage(caught, "Could not verify your email address."),
          canResend: true,
        })
      }
    })()
  }, [token])

  if (outcome.status === "verifying") {
    return (
      <>
        <CardHeader>
          <CardTitle className="text-lg">Verifying your email</CardTitle>
          <CardDescription>This will only take a moment.</CardDescription>
        </CardHeader>

        <CardContent
          className="flex items-center justify-center py-6"
          aria-live="polite"
        >
          <Spinner className="size-5 text-muted-foreground" />
        </CardContent>
      </>
    )
  }

  if (outcome.status === "verified") {
    return (
      <>
        <CardHeader>
          <div className="flex size-9 items-center justify-center rounded-full bg-secondary">
            <CircleCheckIcon className="size-4.5" />
          </div>
          <CardTitle className="text-lg">Email verified</CardTitle>
          <CardDescription>
            Your email address is confirmed. You can log in now.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Button className="w-full" render={<Link href={routes.login} />}>
            Continue to login
          </Button>
        </CardContent>
      </>
    )
  }

  return (
    <>
      <CardHeader>
        <CardTitle className="text-lg">Could not verify your email</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <FormErrorAlert message={outcome.message} />

        {outcome.canResend ? (
          <ResendVerificationRequest />
        ) : (
          <Button render={<Link href={routes.login} />}>Go to login</Button>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link
            href={routes.login}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Back to login
          </Link>
        </p>
      </CardContent>
    </>
  )
}

/**
 * Collects the address before resending.
 *
 * The verification token is opaque and the failure response carries no email, so
 * there is nothing to resend *to* until the user tells us — unlike the signup
 * flow, which already knows the address it just registered.
 */
function ResendVerificationRequest() {
  const [email, setEmail] = React.useState("")
  const [confirmed, setConfirmed] = React.useState<string | null>(null)

  if (confirmed) {
    return <ResendVerificationButton email={confirmed} />
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()

        if (email.trim()) {
          setConfirmed(email.trim().toLowerCase())
        }
      }}
    >
      <Label htmlFor="resend-email">Email address</Label>
      <Input
        id="resend-email"
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@company.com"
      />
      <Button type="submit" variant="outline">
        Send a new link
      </Button>
    </form>
  )
}

export default function VerifyEmailPage() {
  return (
    <React.Suspense
      fallback={
        <CardContent className="flex flex-col gap-3 py-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      }
    >
      <VerifyEmail />
    </React.Suspense>
  )
}
