import { AlertCircleIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/**
 * Non-field error area for the auth forms.
 *
 * Auth failures ("Invalid credentials", a rate limit, an expired link) are not
 * attributable to one input, and a toast is the wrong home for them — it can be
 * missed, it disappears on a timer, and a screen reader may never reach it. This
 * renders inline next to the form and stays put, announced via role="alert".
 *
 * Renders nothing when there is no message, so callers can mount it
 * unconditionally.
 */
export function FormErrorAlert({
  message,
  title,
  children,
}: {
  message?: string | null
  title?: string
  children?: React.ReactNode
}) {
  if (!message && !children) {
    return null
  }

  return (
    // The destructive variant sits on bg-card by default; the tinted border and
    // background give an auth failure enough weight to be noticed.
    <Alert
      variant="destructive"
      className="border-destructive/30 bg-destructive/5"
    >
      <AlertCircleIcon />
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription>
        {message}
        {children}
      </AlertDescription>
    </Alert>
  )
}
