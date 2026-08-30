"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@/components/ui/button"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Spinner } from "@/components/ui/spinner"
import { FormErrorAlert } from "@/components/auth/form-error-alert"
import { getApiErrorMessage } from "@/lib/api-client"
import { mfaCodeFormSchema, type MfaCodeFormInput } from "@/lib/validation-schemas"

/**
 * Second step of an MFA login.
 *
 * The challenge token is passed in as a prop and held in the parent's component
 * state — never in the URL, context, or storage. It is a short-lived credential
 * (MFA_CHALLENGE_TTL_SECONDS, 5 minutes by default), and a query param would
 * write it into browser history, the address bar, and any referrer header.
 *
 * One endpoint serves both code types: the backend inspects the value and
 * decides whether it is a TOTP code or a recovery code, so the toggle below only
 * changes the input affordance, not where the request goes.
 */
export function MfaChallengeForm({
  challengeToken,
  onVerified,
  onCancel,
}: {
  challengeToken: string
  onVerified: (code: string) => Promise<void>
  onCancel: () => void
}) {
  const [useRecoveryCode, setUseRecoveryCode] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const form = useForm<MfaCodeFormInput>({
    resolver: zodResolver(mfaCodeFormSchema),
    defaultValues: { code: "" },
  })

  function toggleMode() {
    // The two inputs accept different shapes, so a half-typed value carried
    // across would be nonsense — and a stale error message even more so.
    form.reset({ code: "" })
    setFormError(null)
    setUseRecoveryCode((previous) => !previous)
  }

  async function onSubmit(values: MfaCodeFormInput) {
    setFormError(null)

    try {
      await onVerified(values.code)
    } catch (caught) {
      setFormError(
        getApiErrorMessage(caught, "That code was not accepted. Try again."),
      )

      // Wrong code: clear it so the next attempt starts from an empty field
      // rather than requiring the user to select and delete first.
      form.reset({ code: "" })
    }
  }

  return (
    <>
      <CardHeader>
        <CardTitle className="text-lg">Two-factor authentication</CardTitle>
        <CardDescription>
          {useRecoveryCode
            ? "Enter one of the recovery codes you saved when you set up two-factor authentication."
            : "Enter the 6-digit code from your authenticator app to finish signing in."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <FormErrorAlert message={formError} />

              {/*
                * Keyed on the mode so React remounts the field when it changes.
                * Without this, swapping between the OTP input and the text input
                * reuses the same node and the segmented input keeps stale state.
                */}
              <FormField
                key={useRecoveryCode ? "recovery" : "totp"}
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {useRecoveryCode ? "Recovery code" : "Authentication code"}
                    </FormLabel>

                    {useRecoveryCode ? (
                      <>
                        <FormControl>
                          <Input
                            autoComplete="one-time-code"
                            autoFocus
                            placeholder="XXXX-XXXX"
                            className="font-mono tracking-wider"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Case and dashes do not matter. Each code works once.
                        </FormDescription>
                      </>
                    ) : (
                      <FormControl>
                        {/*
                          * Segmented input from the `input-otp` package that
                          * shadcn wraps — paste handling, focus management and
                          * mobile keyboards all come from it.
                          */}
                        <InputOTP
                          maxLength={6}
                          autoFocus
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          // Submit as soon as the last digit lands; retyping a
                          // 6-digit code to reach a button is needless friction.
                          onComplete={() => form.handleSubmit(onSubmit)()}
                        >
                          <InputOTPGroup>
                            {[0, 1, 2, 3, 4, 5].map((index) => (
                              <InputOTPSlot key={index} index={index} />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      </FormControl>
                    )}

                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={form.formState.isSubmitting || !challengeToken}
              >
                {form.formState.isSubmitting ? <Spinner /> : null}
                Verify
              </Button>

              <div className="flex flex-col gap-2 text-center text-sm">
                <button
                  type="button"
                  onClick={toggleMode}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {useRecoveryCode
                    ? "Use your authenticator app instead"
                    : "Use a recovery code instead"}
                </button>

                <button
                  type="button"
                  onClick={onCancel}
                  className="text-muted-foreground underline underline-offset-4"
                >
                  Back to login
                </button>
              </div>
            </FieldGroup>
          </form>
        </Form>
      </CardContent>
    </>
  )
}
