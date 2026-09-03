"use client"

import * as React from "react"
import { InfoIcon, ShieldCheckIcon } from "lucide-react"

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
import { FormErrorAlert } from "@/components/auth/form-error-alert"
import { EnableTwoFactorDialog } from "@/components/dashboard/enable-two-factor-dialog"
import { RegenerateRecoveryCodesDialog } from "@/components/dashboard/regenerate-recovery-codes-dialog"
import {
  apiClient,
  getApiErrorCode,
  getApiErrorMessage,
} from "@/lib/api-client"
import type {
  ApiSuccess,
  MfaEnrollResponseData,
  MfaStatusResponseData,
} from "@/lib/api-types"
import { formatAbsoluteDate, formatRelativeTime } from "@/lib/format"

type PageStatus =
  | { status: "loading" }
  | { status: "disabled" }
  | { status: "enabled"; enrolledAt: string | null }
  | { status: "error"; message: string }

export default function TwoFactorSettingsPage() {
  const [page, setPage] = React.useState<PageStatus>({ status: "loading" })
  const [isRetrying, setIsRetrying] = React.useState(false)

  const [isEnrolling, setIsEnrolling] = React.useState(false)
  const [enrollError, setEnrollError] = React.useState<string | null>(null)
  const [enrollment, setEnrollment] = React.useState<MfaEnrollResponseData | null>(
    null,
  )

  const checkStatus = React.useCallback(async (): Promise<PageStatus> => {
    try {
      const response = await apiClient.get<ApiSuccess<MfaStatusResponseData>>(
        "/auth/mfa/status",
      )

      const { enabled, enrolledAt } = response.data.data

      return enabled ? { status: "enabled", enrolledAt } : { status: "disabled" }
    } catch (caught) {
      return {
        status: "error",
        message: getApiErrorMessage(
          caught,
          "We couldn't check your two-factor authentication status.",
        ),
      }
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false

    void (async () => {
      const next = await checkStatus()

      if (!cancelled) {
        setPage(next)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [checkStatus])

  async function handleRetryStatus() {
    setIsRetrying(true)

    try {
      setPage(await checkStatus())
    } finally {
      setIsRetrying(false)
    }
  }

  async function handleEnableClick() {
    setIsEnrolling(true)
    setEnrollError(null)

    try {
      const response = await apiClient.post<ApiSuccess<MfaEnrollResponseData>>(
        "/auth/mfa/totp/enroll",
      )

      setEnrollment(response.data.data)
    } catch (caught) {
      if (getApiErrorCode(caught) === "MFA_TOTP_ALREADY_ENROLLED") {
        // The status check above is accurate as of page load, but this can
        // still happen from a genuine race — 2FA enabled from another tab or
        // device in between. Correct the page rather than show a confusing
        // "already set up" error for what looks, from here, like a fresh
        // click on an "Enable" button. The enrollment time isn't known from
        // here — it happened somewhere else — so this is honestly null rather
        // than guessed.
        setPage({ status: "enabled", enrolledAt: null })
        return
      }

      setEnrollError(
        getApiErrorMessage(caught, "Could not start two-factor setup."),
      )
    } finally {
      setIsEnrolling(false)
    }
  }

  if (page.status === "loading") {
    return <TwoFactorSkeleton />
  }

  if (page.status === "error") {
    return (
      <Card className="items-center gap-4 py-12 text-center shadow-sm">
        <CardContent className="flex max-w-sm flex-col items-center gap-3">
          <h2 className="text-base font-semibold">
            Couldn&apos;t load two-factor settings
          </h2>
          <p className="text-sm text-muted-foreground">{page.message}</p>
          <Button
            variant="outline"
            className="mt-1"
            onClick={() => void handleRetryStatus()}
            disabled={isRetrying}
          >
            {isRetrying ? <Spinner /> : null}
            Try again
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (page.status === "enabled") {
    return (
      <div className="flex flex-col gap-4">
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                Two-factor authentication
              </CardTitle>
              <Badge variant="secondary">
                <ShieldCheckIcon />
                Enabled
              </Badge>
            </div>
            <CardDescription>
              Your account requires a code from your authenticator app when
              signing in.
              {page.enrolledAt ? (
                <>
                  {" "}
                  Turned on{" "}
                  <span title={formatAbsoluteDate(page.enrolledAt)}>
                    {formatRelativeTime(page.enrolledAt)}
                  </span>
                  .
                </>
              ) : null}
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-3">
            <div>
              <RegenerateRecoveryCodesDialog
                trigger={<Button variant="outline">Regenerate recovery codes</Button>}
              />
            </div>

            {/*
              * No "Disable two-factor authentication" button — see the
              * comment below. Building one against an endpoint that does not
              * exist would either silently do nothing or need to be invented,
              * and this settings page should not promise a control that can't
              * act.
              */}
            <DisableNotAvailableNote />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Two-factor authentication</CardTitle>
          <CardDescription>
            Adds a second step to signing in: after your password, you&apos;ll
            also need a 6-digit code from an authenticator app on your phone.
            This means someone who gets your password still can&apos;t get into
            your account without your phone too.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          <FormErrorAlert message={enrollError} />

          <div>
            <Button onClick={() => void handleEnableClick()} disabled={isEnrolling}>
              {isEnrolling ? <Spinner /> : null}
              Enable two-factor authentication
            </Button>
          </div>
        </CardContent>
      </Card>

      <EnableTwoFactorDialog
        key={enrollment?.secret ?? "closed"}
        open={enrollment !== null}
        enrollment={enrollment}
        onOpenChange={(open) => {
          if (!open) {
            setEnrollment(null)
          }
        }}
        onEnabled={() => {
          setEnrollment(null)
          // Known exactly, unlike the race-recovery case above: verify-setup
          // just succeeded this instant.
          setPage({ status: "enabled", enrolledAt: new Date().toISOString() })
        }}
      />
    </div>
  )
}

/**
 * States the gap plainly rather than guessing at a shape. Checked, not
 * assumed: no route anywhere under backend/src/routes/ accepts anything that
 * turns MFA off, and `mfa.service.ts` exports no such function either — the
 * enroll error message even says so ("Remove it before enrolling a new one"),
 * acknowledging the gap without closing it.
 */
function DisableNotAvailableNote() {
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>
        Disabling two-factor authentication isn&apos;t available yet — the API
        has no endpoint for it.
      </span>
    </p>
  )
}

function TwoFactorSkeleton() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <Skeleton className="h-5 w-56" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-4 w-2/3 max-w-md" />
        <Skeleton className="mt-2 h-8 w-56" />
      </CardContent>
    </Card>
  )
}
