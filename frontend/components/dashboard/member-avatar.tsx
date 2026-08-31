import { Avatar, AvatarFallback } from "@/components/ui/avatar"

/**
 * Initials avatar for a member.
 *
 * There is no avatar upload in this product, and — see the note on the Members
 * page — the members endpoint returns no name or email, so for most rows the
 * only identifier available is the opaque `userId`. When a display name is
 * known (currently only the signed-in user's own row) real initials are used;
 * otherwise the first two characters of the id stand in, which at least gives
 * each row a stable, distinguishable mark rather than an identical placeholder.
 */
export function MemberAvatar({
  displayName,
  userId,
}: {
  displayName?: string | null
  userId: string
}) {
  return (
    <Avatar className="size-8">
      <AvatarFallback className="text-xs">
        {initialsFor(displayName, userId)}
      </AvatarFallback>
    </Avatar>
  )
}

function initialsFor(
  displayName: string | null | undefined,
  userId: string,
): string {
  const name = displayName?.trim()

  if (name) {
    const parts = name.split(/[\s@._-]+/).filter(Boolean)

    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }

    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase()
    }
  }

  // Ids are cuids and start with a constant "c", so skip it for a little more
  // visual variety between rows.
  const meaningful = userId.replace(/^c/, "") || userId

  return meaningful.slice(0, 2).toUpperCase()
}
