"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { apiClient, getApiErrorMessage, getApiFieldErrors } from "@/lib/api-client"
import type { ApiSuccess, ApplicationResponseData } from "@/lib/api-types"
import {
  createApplicationSchema,
  type CreateApplicationInput,
} from "@/lib/validation-schemas"
import { routes } from "@/lib/navigation"

/**
 * Creation is a dialog rather than a route: it asks for one field, and sending
 * someone to a dedicated page to answer a single question — then back again —
 * is heavier than the task deserves.
 *
 * On success it navigates straight to the new application's detail page. The
 * next thing anyone does after creating an application is set it up (generate
 * an API key), not admire it in a list, so returning to the list would just add
 * a click.
 */
export function CreateApplicationDialog({
  trigger,
}: {
  trigger: React.ReactElement
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const form = useForm<CreateApplicationInput>({
    resolver: zodResolver(createApplicationSchema),
    defaultValues: { name: "" },
  })

  async function onSubmit(values: CreateApplicationInput) {
    setFormError(null)

    try {
      const response = await apiClient.post<
        ApiSuccess<ApplicationResponseData>
      >("/applications", values)

      const application = response.data.data.application

      /*
       * Left open through the navigation. Closing first would render the empty
       * list behind the dialog for a frame before the route changes, which
       * reads as "nothing happened".
       */
      router.push(routes.application(application.id))
    } catch (caught) {
      const fieldErrors = getApiFieldErrors(caught)

      if (fieldErrors?.name) {
        form.setError("name", { message: fieldErrors.name })
      }

      // Stays open on failure so the typed name is not lost.
      setFormError(
        getApiErrorMessage(caught, "Could not create the application."),
      )
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)

    // Reset on close so reopening does not resurrect a stale error or name.
    if (!nextOpen) {
      form.reset({ name: "" })
      setFormError(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create application</DialogTitle>
          <DialogDescription>
            An application represents one project you want to add authentication
            to.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <FormErrorAlert message={formError} />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Application name</FormLabel>
                    <FormControl>
                      <Input
                        autoFocus
                        placeholder="Acme Dashboard"
                        maxLength={80}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      You can change this later.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <DialogClose
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      disabled={form.formState.isSubmitting}
                    />
                  }
                >
                  Cancel
                </DialogClose>

                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? <Spinner /> : <PlusIcon />}
                  Create application
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
