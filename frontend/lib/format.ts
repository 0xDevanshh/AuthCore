const RELATIVE_TIME = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

const DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
]

/**
 * "3 days ago", "last month" — for timestamps shown next to a record.
 *
 * Only safe to render on the client: the output depends on the current time, so
 * producing it during a server render and again on hydration can disagree and
 * trip a mismatch. Every caller so far renders after a client-side fetch.
 */
export function formatRelativeTime(isoDate: string): string {
  const timestamp = new Date(isoDate).getTime()

  if (Number.isNaN(timestamp)) {
    return "unknown"
  }

  let duration = (timestamp - Date.now()) / 1000

  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return RELATIVE_TIME.format(Math.round(duration), division.unit)
    }

    duration /= division.amount
  }

  return "unknown"
}

/** "12 Mar 2025" — the exact date, for tooltips and title attributes. */
export function formatAbsoluteDate(isoDate: string): string {
  const date = new Date(isoDate)

  if (Number.isNaN(date.getTime())) {
    return "Unknown date"
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}
