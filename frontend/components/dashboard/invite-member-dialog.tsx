"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { SendIcon } from "lucide-react"

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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { FormErrorAlert } from "@/components/auth/form-error-alert"
import { apiClient, getApiErrorCode, getApiErrorMessage } from "@/lib/api-client"
import type { PendingInvitation } from "@/lib/api-types"
import { useApplicationRoles } from "@/lib/use-application-roles"
import {
  sendInvitationSchema,
  type SendInvitationInput,
} from "@/lib/validation-schemas"

/**
 * The backend's named refusals.
 *
 * Each is a different situation with a different next step — one means the
 * person already has access, the other means an invitation is already on its
 * way — so collapsing them into a single failure message would hide the only
 * part the inviter needs. Codes come from invitation.service.ts.
 */
const REJECTIONS: Record<string, string> = {
  ALREADY_A_MEMBER:
    "That person is already a member of this application. You can see them on the Members tab.",
  INVITATION_ALREADY_PENDING:
    "An invitation for this email is already pending. Revoke the existing one first if you want to change its role.",
  ROLE_APPLICATION_MISMATCH:
    "That role doesn't belong to this application. Reload the page and try again.",
}

export function InviteMemberDialog({
  applicationId,
  pendingInvitations,
  onInvited,
  trigger,
}: {
  applicationId: string
  /** Fallback source of role ids — see useApplicationRoles. */
  pendingInvitations: PendingInvitation[]
  /** Refetches the list; the create response is too narrow to build a row. */
  onInvited: () => Promise<void>
  trigger: React.ReactElement
}) {
  const [open, setOpen] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const { roles, isLoading, isUnavailable } = useApplicationRoles(
    applicationId,
    pendingInvitations,
    open,
  )

  const form = useForm<SendInvitationInput>({
    resolver: zodResolver(sendInvitationSchema),
    defaultValues: { email: "", roleId: "" },
  })

  async function onSubmit(values: SendInvitationInput) {
    setFormError(null)

    try {
      await apiClient.post(`/applications/${applicationId}/invitations`, values)

      /*
       * The 201 body carries only { id, email, createdAt, expiresAt } — no
       * roleId, roleName or invitedBy — so a complete row cannot be assembled
       * from it. Refetching is one request on an infrequent action and keeps
       * the table honest.
       */
      await onInvited()

      setOpen(false)
      form.reset({ email: "", roleId: "" })
    } catch (caught) {
      const code = getApiErrorCode(caught)

      if (code === "ALREADY_A_MEMBER" || code === "INVITATION_ALREADY_PENDING") {
        // Attributable to the email field, so it lands there rather than in
        // the general alert area.
        form.setError("email", { message: REJECTIONS[code] })
        return
      }

      setFormError(
        (code && REJECTIONS[code]) ??
          getApiErrorMessage(caught, "Could not send the invitation."),
      )
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)

    if (!next) {
      form.reset({ email: "", roleId: "" })
      setFormError(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>
            They&apos;ll get an email with a link to join this application.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <FormErrorAlert message={formError} />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email address</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="off"
                        placeholder="teammate@company.com"
                        autoFocus
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="roleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>

                    {isLoading ? (
                      <Skeleton className="h-8 w-full" />
                    ) : isUnavailable ? (
                      <RolesUnavailable />
                    ) : (
                      <Select
                        value={field.value}
                        onValueChange={(value) =>
                          field.onChange(value as string)
                        }
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Choose a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {roles.map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <DialogClose
                  render={
                    <Button
                      variant="outline"
                      disabled={form.formState.isSubmitting}
                    />
                  }
                >
                  Cancel
                </DialogClose>

                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting || isUnavailable || isLoading}
                >
                  {form.formState.isSubmitting ? <Spinner /> : <SendIcon />}
                  Send invitation
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Shown when no role ids could be discovered. Says what is missing rather than
 * offering an empty dropdown that would silently produce an invalid request.
 */
function RolesUnavailable() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-panel p-3 text-xs text-muted-foreground">
      Roles couldn&apos;t be loaded. The API needs a role id to send an
      invitation, and this backend has no endpoint that lists an
      application&apos;s roles — see the note in lib/use-application-roles.ts.
    </div>
  )
}
