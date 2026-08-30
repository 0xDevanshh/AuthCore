"use client"

import * as React from "react"
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { cn } from "@/lib/utils"

/**
 * react-hook-form bindings for the shadcn field primitives.
 *
 * The `form` item in this registry (style `base-nova`, built on Base UI rather
 * than Radix) resolves to an empty stub — v4 replaced the old RHF-bound
 * form.tsx with the presentational `field` set, which knows nothing about form
 * state. This module supplies the missing half: the familiar
 * Form/FormField/FormItem/FormLabel/FormControl/FormMessage API, rendering
 * through `field` so it inherits the same styling as everything else.
 */

const Form = FormProvider

type FormFieldContextValue = { name: string }

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null)
const FormItemContext = React.createContext<{ id: string } | null>(null)

/*
 * All three of Controller's generics are forwarded, including
 * TTransformedValues. Dropping the third would reject the `control` of any form
 * whose schema transforms — where the submitted type differs from the field
 * type, as on the signup form's optional names.
 */
function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>({ ...props }: ControllerProps<TFieldValues, TName, TTransformedValues>) {
  const value = React.useMemo(() => ({ name: props.name }), [props.name])

  return (
    <FormFieldContext value={value}>
      <Controller {...props} />
    </FormFieldContext>
  )
}

/**
 * Ids and validation state for the field being rendered. Consumed by the
 * label/control/description/message parts so they stay wired together for
 * assistive tech without the caller threading ids by hand.
 */
function useFormField() {
  const fieldContext = React.use(FormFieldContext)
  const itemContext = React.use(FormItemContext)
  const { getFieldState } = useFormContext()
  const formState = useFormState({ name: fieldContext?.name })

  if (!fieldContext) {
    throw new Error("useFormField must be used within a <FormField>")
  }

  if (!itemContext) {
    throw new Error("useFormField must be used within a <FormItem>")
  }

  const fieldState = getFieldState(fieldContext.name, formState)
  const { id } = itemContext

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

function FormItem({ className, ...props }: React.ComponentProps<typeof Field>) {
  const id = React.useId()
  const value = React.useMemo(() => ({ id }), [id])

  return (
    <FormItemContext value={value}>
      <Field className={cn(className)} {...props} />
    </FormItemContext>
  )
}

function FormLabel({
  className,
  ...props
}: React.ComponentProps<typeof FieldLabel>) {
  const { error, formItemId } = useFormField()

  return (
    <FieldLabel
      data-error={!!error}
      className={cn("data-[error=true]:text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  )
}

/**
 * Wires the id and aria attributes onto the single input element it wraps.
 *
 * Radix's Slot would normally do this; Base UI has no drop-in equivalent, so
 * the child is cloned instead. That keeps the call site as
 * `<FormControl><Input {...field} /></FormControl>`, which is what the rest of
 * the shadcn ecosystem expects.
 */
function FormControl({ children }: { children: React.ReactElement }) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()

  return React.cloneElement(
    children,
    {
      id: formItemId,
      "aria-describedby": error
        ? `${formDescriptionId} ${formMessageId}`
        : formDescriptionId,
      "aria-invalid": !!error,
    } as React.HTMLAttributes<HTMLElement>,
  )
}

function FormDescription({
  className,
  ...props
}: React.ComponentProps<typeof FieldDescription>) {
  const { formDescriptionId } = useFormField()

  return (
    <FieldDescription id={formDescriptionId} className={className} {...props} />
  )
}

/**
 * Renders the field's validation message, or nothing when the field is valid.
 * Children override the message, matching the upstream component.
 */
function FormMessage({
  className,
  children,
  ...props
}: React.ComponentProps<typeof FieldError>) {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error.message ?? "") : children

  if (!body) {
    return null
  }

  return (
    <FieldError id={formMessageId} className={className} {...props}>
      {body}
    </FieldError>
  )
}

export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
}
