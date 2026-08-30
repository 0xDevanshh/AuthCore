"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

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
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { FormErrorAlert } from "@/components/auth/form-error-alert"
import {
  apiClient,
  getApiErrorCode,
  getApiErrorMessage,
  isMissingApiKeyError,
} from "@/lib/api-client"
import {
  resetPasswordFormSchema,
  type ResetPasswordFormInput,
} from "@/lib/validation-schemas"
import { routes } from "@/lib/navigation"

/**
 * A token problem is terminal for this page — no amount of retyping the password
 * fixes it — so these are rendered instead of the form, each pointing at the one
 * action that helps. Codes come from password-reset.service.ts.
 */
const TERMINAL_TOKEN_ERRORS: Record<string, string> = {
  RESET_TOKEN_NOT_FOUND:
    "This password reset link is not valid. It may have been altered in transit — try copying the full link from your email, or request a new one.",
  RESET_TOKEN_EXPIRED:
    "This password reset link has expired. Reset links are valid for a short window, so you'll need a new one.",
  RESET_TOKEN_ALREADY_USED:
    "This password reset link has already been used. If you still need to change your password, request a new link.",
}

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [formError, setFormError] = React.useState<string | null>(null)
  const [terminalError, setTerminalError] = React.useState<string | null>(null)

  const form = useForm<ResetPasswordFormInput>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  })

  async function onSubmit(values: ResetPasswordFormInput) {
    setFormError(null)

    if (!token) {
      return
    }

    try {
      await apiClient.post("/auth/reset-password", {
        token,
        // confirmPassword is a client-side guard and is deliberately not sent.
        newPassword: values.newPassword,
      })

      toast.success("Password reset — please log in.")
      router.replace(routes.login)
    } catch (caught) {
      const code = getApiErrorCode(caught)

      if (code && code in TERMINAL_TOKEN_ERRORS) {
        setTerminalError(TERMINAL_TOKEN_ERRORS[code])
        return
      }

      setFormError(
        isMissingApiKeyError(caught)
          ? "This AuthCore instance is not accepting password resets yet. See the note in lib/api-client.ts."
          : getApiErrorMessage(caught, "Could not reset your password."),
      )
    }
  }

  // No token at all — the link was truncated, or the page was opened directly.
  if (!token) {
    return (
      <TokenProblem
        message="This page needs a reset link from your email. Open the link from the message we sent, or request a new one."
      />
    )
  }

  if (terminalError) {
    return <TokenProblem message={terminalError} />
  }

  return (
    <>
      <CardHeader>
        <CardTitle className="text-lg">Set a new password</CardTitle>
        <CardDescription>
          Choose a new password for your AuthCore account.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <FormErrorAlert message={formError} />

              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        autoFocus
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      At least 8 characters, with upper and lower case, a number,
                      and a special character.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm new password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Spinner /> : null}
                Reset password
              </Button>
            </FieldGroup>
          </form>
        </Form>
      </CardContent>
    </>
  )
}

function TokenProblem({ message }: { message: string }) {
  return (
    <>
      <CardHeader>
        <CardTitle className="text-lg">Link no longer valid</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <FormErrorAlert message={message} />

        <Button render={<Link href={routes.forgotPassword} />}>
          Request a new link
        </Button>

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

/*
 * useSearchParams needs a Suspense boundary above it, or the whole route opts
 * out of static rendering.
 */
export default function ResetPasswordPage() {
  return (
    <React.Suspense
      fallback={
        <CardContent className="flex flex-col gap-3 py-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      }
    >
      <ResetPasswordForm />
    </React.Suspense>
  )
}
