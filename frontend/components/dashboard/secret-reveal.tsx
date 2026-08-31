"use client"

import * as React from "react"
import { CheckIcon, CopyIcon, TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Shows a secret that exists exactly once.
 *
 * Everything here is shaped around the fact that this value cannot be recovered:
 * the warning comes before the value, the dashed border marks it as transient
 * rather than a settled part of the page, and the copy confirmation appears on
 * the button itself rather than in a toast — a toast can be missed or land in a
 * corner, and this is the one moment that needs the reader's full attention.
 *
 * The value is selectable as well as copyable, since clipboard access can be
 * refused by the browser and there must always be a manual way out.
 */
export function SecretReveal({
  secret,
  warning = "This key will only be shown once. Copy it now.",
}: {
  secret: string
  warning?: string
}) {
  const [copied, setCopied] = React.useState(false)
  const [copyFailed, setCopyFailed] = React.useState(false)

  React.useEffect(() => {
    if (!copied) {
      return
    }

    const timer = setTimeout(() => setCopied(false), 2500)

    return () => clearTimeout(timer)
  }, [copied])

  async function handleCopy() {
    setCopyFailed(false)

    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
    } catch {
      // Insecure origin or a blocking permissions policy. Say so, rather than
      // letting the button look like it worked.
      setCopyFailed(true)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2 text-sm font-medium text-destructive">
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
        {warning}
      </p>

      <div className="rounded-lg border border-dashed border-border bg-panel p-3">
        <code className="block break-all font-mono text-xs leading-relaxed select-all">
          {secret}
        </code>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleCopy}
          className="w-full"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy key"}
        </Button>
      </div>

      {copyFailed ? (
        <p className="text-xs text-destructive">
          Your browser blocked clipboard access. Select the key above and copy it
          manually.
        </p>
      ) : null}
    </div>
  )
}
