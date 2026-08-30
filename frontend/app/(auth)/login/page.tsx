"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { FormErrorAlert } from "@/components/auth/form-error-alert"
import { MfaChallengeForm } from "@/components/auth/mfa-challenge-form"
import { useAuth } from "@/lib/auth-context"
import { getApiErrorMessage, isMissingApiKeyError } from "@/lib/api-client"
import { loginSchema, type LoginInput } from "@/lib/validation-schemas"
import { routes } from "@/lib/navigation"

export default function LoginPage() {
  const router = useRouter()
  const { login, completeMfaChallenge } = useAuth()

  /*
   * Held in component state only — deliberately not in context, storage, or the
   * URL. This is a short-lived credential for exactly one endpoint, and it
   * should not outlive the tab or appear in history. Navigating away discards
   * it, which is the correct outcome: the user restarts the login.
   */
  const [challengeToken, setChallengeToken] = React.useState<string | null>(null)
  const [formError, setFormError] = React.useState<string | null>(null)

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  async function onSubmit(values: LoginInput) {
    setFormError(null)

    try {
      const result = await login(values)

      /*
       * Half a login. No session exists yet and no tokens were issued, so
       * nothing here may treat the user as authenticated — the auth context
       * deliberately leaves `user` null in this branch.
       */
      if (result.mfaRequired) {
        setChallengeToken(result.challengeToken)
        return
      }

      router.replace(routes.applications)
    } catch (caught) {
      setFormError(
        isMissingApiKeyError(caught)
          ? "This AuthCore instance is not accepting dashboard logins yet. See the note in lib/api-client.ts."
          : getApiErrorMessage(caught, "Could not sign you in."),
      )
    }
  }

  if (challengeToken) {
    return (
      <MfaChallengeForm
        challengeToken={challengeToken}
        onVerified={async (code) => {
          // Throws on a bad code; MfaChallengeForm surfaces the message.
          await completeMfaChallenge({ challengeToken, code })
          router.replace(routes.applications)
        }}
        onCancel={() => {
          setChallengeToken(null)
          form.reset()
        }}
      />
    )
  }

  return (
    <>
      <CardHeader>
        <CardTitle className="text-lg">Log in to AuthCore</CardTitle>
        <CardDescription>
          Welcome back. Enter your details to continue.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <FormErrorAlert message={formError} />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="you@company.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel>Password</FormLabel>
                      <Link
                        href={routes.forgotPassword}
                        className="text-sm text-muted-foreground underline underline-offset-4"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Spinner /> : null}
                Log in
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link
                  href={routes.signup}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Sign up
                </Link>
              </p>
            </FieldGroup>
          </form>
        </Form>
      </CardContent>
    </>
  )
}
