"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@/components/ui/button"
import {
  Card,
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
import { Spinner } from "@/components/ui/spinner"
import { FormErrorAlert } from "@/components/auth/form-error-alert"
import { FormSuccessAlert } from "@/components/auth/form-success-alert"
import { apiClient, getApiErrorMessage, getApiFieldErrors } from "@/lib/api-client"
import {
  changePasswordFormSchema,
  type ChangePasswordFormInput,
} from "@/lib/validation-schemas"

/*
 * =============================================================================
 * WHY THIS ROUTE IS NOT BLOCKED BY THE API-KEY GAP DOCUMENTED ELSEWHERE
 * =============================================================================
 *
 * Every auth page built so far (login, signup, forgot/reset-password) had to
 * flag that its endpoint sits behind `resolveApplication` and 401s with no
 * secret key. Checked, and /auth/change-password does not have that problem:
 * per the comment on `authRouter.post("/change-password", ...)` in
 * backend/src/routes/auth.routes.ts, this route is `requireAuth` only — "the
 * session is the credential here, not an API key." So this page works against
 * the real backend as soon as a session exists, unlike its siblings.
 */

/**
 * The current-password check and a wrong-session check share one error code.
 *
 * `changePassword` (backend/src/services/user.service.ts) throws
 * `AppError(401, ..., "INVALID_CREDENTIALS")` for both "no such user / account
 * disabled" AND "current password is wrong" — same code, different message.
 * The code alone can't distinguish them, so this checks the exact message the
 * service throws for the password case specifically, rather than assuming
 * every 401 here means a wrong password.
 */
const WRONG_CURRENT_PASSWORD_MESSAGE = "Current password is incorrect"

/**
 * Also field-attributable, same reasoning: `changePassword` rejects a new
 * password identical to the current one before doing any work, and that
 * belongs on the new-password field rather than the general alert area.
 */
const PASSWORD_UNCHANGED_MESSAGE =
  "New password must be different from the current one"

export default function ChangePasswordPage() {
  const [successMessage, setSuccessMessage] = React.useState<string | null>(
    null,
  )
  const [formError, setFormError] = React.useState<string | null>(null)

  const form = useForm<ChangePasswordFormInput>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  })

  async function onSubmit(values: ChangePasswordFormInput) {
    setFormError(null)
    setSuccessMessage(null)

    try {
      const response = await apiClient.post<{
        success: true
        message?: string
      }>("/auth/change-password", {
        currentPassword: values.currentPassword,
        // confirmPassword is a client-side guard against typos and is never sent.
        newPassword: values.newPassword,
      })

      /*
       * The backend's own wording ("Password changed successfully. Other
       * devices have been signed out.") is shown as-is rather than
       * paraphrased, plus one clarifying line this response doesn't state
       * outright: the session behind *this* request is deliberately spared —
       * changePassword passes `currentSessionId` so the tab you're sitting in
       * keeps working.
       */
      setSuccessMessage(
        response.data.message ??
          "Password changed successfully. Other devices have been signed out.",
      )

      // Old and new passwords alike are cleared — nothing sits in the form
      // after a successful change.
      form.reset({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      })
    } catch (caught) {
      const message = getApiErrorMessage(caught)

      if (message === WRONG_CURRENT_PASSWORD_MESSAGE) {
        // Attributable to one field, so it lands there rather than in the
        // general alert area — the rest of the form was filled in correctly.
        form.setError("currentPassword", { message })
        form.setFocus("currentPassword")
        return
      }

      if (message === PASSWORD_UNCHANGED_MESSAGE) {
        form.setError("newPassword", { message })
        form.setFocus("newPassword")
        return
      }

      const fieldErrors = getApiFieldErrors(caught)

      if (fieldErrors) {
        for (const [name, fieldMessage] of Object.entries(fieldErrors)) {
          if (name === "currentPassword" || name === "newPassword") {
            form.setError(name, { message: fieldMessage })
          }
        }

        return
      }

      setFormError(getApiErrorMessage(caught, "Could not change your password."))
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Change password</CardTitle>
        <CardDescription>
          Choose a new password for your AuthCore account.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <FormSuccessAlert message={successMessage}>
                {successMessage ? (
                  <p className="mt-1">This device stays signed in.</p>
                ) : null}
              </FormSuccessAlert>

              <FormErrorAlert message={formError} />

              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current password</FormLabel>
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
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      At least 8 characters, with upper and lower case, a
                      number, and a special character.
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

              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="self-start"
              >
                {form.formState.isSubmitting ? <Spinner /> : null}
                Change password
              </Button>
            </FieldGroup>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
