"use client"

import * as React from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { MailCheckIcon } from "lucide-react"

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
import { apiClient, getApiErrorMessage, isMissingApiKeyError } from "@/lib/api-client"
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@/lib/validation-schemas"
import { routes } from "@/lib/navigation"

export default function ForgotPasswordPage() {
  /*
   * Holds the backend's own message. This endpoint answers identically whether
   * or not an account exists for the address — it is the classic probe for
   * "which of these addresses is registered" — so the response is displayed
   * verbatim and nothing here branches on it. Adding any client-side
   * distinction (a different message, an error state for unknown addresses)
   * would leak exactly what the backend refuses to.
   */
  const [sentMessage, setSentMessage] = React.useState<string | null>(null)
  const [formError, setFormError] = React.useState<string | null>(null)

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  })

  async function onSubmit(values: ForgotPasswordInput) {
    setFormError(null)

    try {
      const response = await apiClient.post<{ success: true; message?: string }>(
        "/auth/forgot-password",
        values,
      )

      setSentMessage(
        response.data.message ??
          "If an account exists for that address, a reset link has been sent.",
      )
    } catch (caught) {
      /*
       * Only genuine failures reach here — a rate limit, a network error, or the
       * API-key gate. The success path never distinguishes between addresses.
       */
      setFormError(
        isMissingApiKeyError(caught)
          ? "This AuthCore instance is not accepting password reset requests yet. See the note in lib/api-client.ts."
          : getApiErrorMessage(caught, "Could not send the reset email."),
      )
    }
  }

  if (sentMessage) {
    return (
      <>
        <CardHeader>
          <div className="flex size-9 items-center justify-center rounded-full bg-secondary">
            <MailCheckIcon className="size-4.5" />
          </div>
          <CardTitle className="text-lg">Check your inbox</CardTitle>
          <CardDescription>{sentMessage}</CardDescription>
        </CardHeader>

        <CardContent>
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

  return (
    <>
      <CardHeader>
        <CardTitle className="text-lg">Reset your password</CardTitle>
        <CardDescription>
          Enter your email address and we&apos;ll send you a link to set a new
          password.
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
                        autoFocus
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Spinner /> : null}
                Send reset link
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Remembered it?{" "}
                <Link
                  href={routes.login}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Log in
                </Link>
              </p>
            </FieldGroup>
          </form>
        </Form>
      </CardContent>
    </>
  )
}
