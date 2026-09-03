"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { RecoveryCodesReveal } from "@/components/dashboard/recovery-codes-reveal"

/**
 * The reveal-once codes plus the mandatory "I've saved these" checkbox.
 *
 * Deliberately just the content — not a dialog of its own. Both places that
 * need this (finishing enrollment, and regenerating codes from an already-
 * enabled account) are otherwise different dialogs with different headers and
 * different "how did we get here" context, and forcing them to share one
 * dialog shell would mean threading unrelated state through a single
 * component. The acknowledgment checkbox lives here because the reveal and the
 * checkbox are never meaningfully separate; the Done button and the
 * close-blocking logic stay with each caller, since both need the same
 * `acknowledged` flag anyway to decide whether a close attempt should be
 * honoured.
 */
export function RecoveryCodesAcknowledge({
  codes,
  acknowledged,
  onAcknowledgedChange,
  warning,
}: {
  codes: string[]
  acknowledged: boolean
  onAcknowledgedChange: (acknowledged: boolean) => void
  warning?: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <RecoveryCodesReveal codes={codes} warning={warning} />

      {/*
        * A single native <label>, not the styled Label component (which is
        * itself a <label> — nesting one inside another is invalid HTML and
        * would make click delegation unpredictable). Base UI's Checkbox
        * renders a real hidden <input type="checkbox"> alongside its visible
        * span, so this implicit label association is what makes clicking the
        * text — not just the box — toggle it.
        */}
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <Checkbox
          checked={acknowledged}
          onCheckedChange={(checked) => onAcknowledgedChange(checked === true)}
          className="mt-0.5"
        />
        I&apos;ve saved these codes
      </label>
    </div>
  )
}
