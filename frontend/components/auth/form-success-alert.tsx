import { CircleCheckIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/**
 * Non-field success area, styled as the positive counterpart to
 * FormErrorAlert.
 *
 * Reserved for actions where confirmation needs to be read carefully, not
 * glanced at — a security-relevant change like a password update, where a
 * toast's few seconds on screen is the wrong amount of attention for something
 * the user needs to register and trust before moving on.
 *
 * Renders nothing when there is no message, so callers can mount it
 * unconditionally.
 */
export function FormSuccessAlert({
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
    <Alert className="border-success/30 bg-success/5 text-success">
      <CircleCheckIcon />
      {title ? <AlertTitle className="text-success">{title}</AlertTitle> : null}
      <AlertDescription className="text-success/90">
        {message}
        {children}
      </AlertDescription>
    </Alert>
  )
}
