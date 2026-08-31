"use client"

import * as React from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * A copyable snippet.
 *
 * Scrolls horizontally rather than wrapping: a wrapped shell command is hard to
 * read and easy to mis-transcribe, and the copy button means nobody has to
 * select it by hand anyway.
 */
export function CodeBlock({
  code,
  label,
  className,
}: {
  code: string
  label?: string
  className?: string
}) {
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) {
      return
    }

    const timer = setTimeout(() => setCopied(false), 2000)

    return () => clearTimeout(timer)
  }, [copied])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // Clipboard access can be denied (insecure origin, permissions policy).
      // The text is selectable, so failing quietly is acceptable here.
    }
  }

  return (
    <div className={cn("relative rounded-lg border border-border bg-panel", className)}>
      {label ? (
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="font-mono text-xs text-muted-foreground">
            {label}
          </span>
        </div>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy to clipboard"}
        className="absolute top-1.5 right-1.5"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>

      <pre className="overflow-x-auto p-3 pr-10 text-xs leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  )
}
