"use client"

import * as React from "react"
import { CheckIcon, CopyIcon, TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Shows a set of recovery codes that exist in the clear exactly once.
 *
 * Same reveal-once ethos as `SecretReveal` (the API key display): the warning
 * comes first, the codes sit in a dashed-border block that reads as transient
 * rather than settled, and the copy confirmation lands on the button itself
 * rather than a toast that could be missed.
 *
 * A real list rather than one joined string — CSS `white-space: normal` would
 * collapse embedded newlines in plain text, so each code gets its own list item
 * instead of relying on line breaks that wouldn't render. The clipboard copy
 * still joins with real newlines, since that's what a pasted file or password
 * manager entry should look like.
 */
export function RecoveryCodesReveal({
  codes,
  warning = "These codes will only be shown once. Save them somewhere safe now.",
}: {
  codes: string[]
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
      await navigator.clipboard.writeText(codes.join("\n"))
      setCopied(true)
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2 text-sm font-medium text-destructive">
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
        {warning}
      </p>

      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-dashed border-border bg-panel p-3">
        {codes.map((code) => (
          <li
            key={code}
            className="font-mono text-xs leading-relaxed select-all"
          >
            {code}
          </li>
        ))}
      </ul>

      <Button type="button" variant="outline" onClick={handleCopy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copied" : "Copy all codes"}
      </Button>

      {copyFailed ? (
        <p className="text-xs text-destructive">
          Your browser blocked clipboard access. Select the codes above and
          copy them manually.
        </p>
      ) : null}
    </div>
  )
}
