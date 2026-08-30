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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { FormErrorAlert } from "@/components/auth/form-error-alert"
import { ResendVerificationButton } from "@/components/auth/resend-verification-button"
import {
  apiClient,
  getApiErrorMessage,
  getApiFieldErrors,
  isMissingApiKeyError,
} from "@/lib/api-client"
import type { ApiSuccess, SignupResponseData } from "@/lib/api-types"
import {
  signupFormSchema,
  type SignupFormInput,
  type SignupFormOutput,
} from "@/lib/validation-schemas"
import { routes } from "@/lib/navigation"

export default function SignupPage() {
  /*
   * Set on success, which swaps the form for the "check your inbox" panel.
   * Holding the address here is what lets the resend button re-send without
   * asking for it again.
   */
  const [registeredEmail, setRegisteredEmail] = React.useState<string | null>(
    null,
  )
  const [emailSent, setEmailSent] = React.useState(true)
  const [formError, setFormError] = React.useState<string | null>(null)

  /*
   * Three generics because the schema transforms: the form holds the input
   * shape (all strings, so the inputs stay controlled) while handleSubmit hands
   * onSubmit the output shape, with blank names already mapped to undefined.
   */
  const form = useForm<SignupFormInput, unknown, SignupFormOutput>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
    },
  })

  async function onSubmit(values: SignupFormOutput) {
    setFormError(null)

    try {
      // Already the output shape: blank name fields arrive as undefined and are
      // omitted from the JSON body, which is what the backend needs (it rejects "").
      const response = await apiClient.post<ApiSuccess<SignupResponseData>>(
        "/auth/signup",
        values,
      )

      /*
       * The backend answers 201 even when the verification email could not be
       * sent — the account exists either way, and `emailSent` is what tells us
       * to lead with the resend prompt.
       */
      setEmailSent(response.data.data.emailSent)
      setRegisteredEmail(values.email)
    } catch (caught) {
      // Field-level errors from the server land on the matching input.
      const fieldErrors = getApiFieldErrors(caught)

      if (fieldErrors) {
        for (const [name, message] of Object.entries(fieldErrors)) {
          if (name === "email" || name === "password" || name === "firstName" || name === "lastName") {
            form.setError(name, { message })
          }
        }
      }

      setFormError(
        isMissingApiKeyError(caught)
          ? "This AuthCore instance is not accepting dashboard sign-ups yet. See the note in lib/api-client.ts."
          : getApiErrorMessage(caught, "Could not create your account."),
      )
    }
  }

  if (registeredEmail) {
    return (
      <>
        <CardHeader>
          <div className="flex size-9 items-center justify-center rounded-full bg-secondary">
            <MailCheckIcon className="size-4.5" />
          </div>
          <CardTitle className="text-lg">Check your inbox</CardTitle>
          <CardDescription>
            {emailSent ? (
              <>
                We sent a verification link to{" "}
                <span className="font-medium text-foreground">
                  {registeredEmail}
                </span>
                . Open it to finish setting up your account.
              </>
            ) : (
              <>
                Your account was created, but we could not send the verification
                email to{" "}
                <span className="font-medium text-foreground">
                  {registeredEmail}
                </span>
                . Request a new one below.
              </>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <ResendVerificationButton email={registeredEmail} />

          <p className="text-center text-sm text-muted-foreground">
            Already verified?{" "}
            <Link
              href={routes.login}
              className="font-medium text-foreground underline underline-offset-4"
            >
              Log in
            </Link>
          </p>
        </CardContent>
      </>
    )
  }

  return (
    <>
      <CardHeader>
        <CardTitle className="text-lg">Create your account</CardTitle>
        <CardDescription>
          Start managing authentication for your applications.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <FormErrorAlert message={formError} />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First name</FormLabel>
                      <FormControl>
                        <Input autoComplete="given-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last name</FormLabel>
                      <FormControl>
                        <Input autoComplete="family-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
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

              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Spinner /> : null}
                Create account
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
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
