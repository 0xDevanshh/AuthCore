/**
 * Readable labels for audit log actions.
 *
 * Every key here was taken from an actual `logAuditEvent({ action: "..." })`
 * call in the backend rather than invented, so the list matches what is really
 * written today. Anything not in the map falls back to a humanised form of the
 * raw string, so an action added later still reads sensibly instead of showing
 * a blank cell.
 *
 * Note there is no LOGIN_SUCCESS / LOGIN_FAILED: sign-in attempts are recorded
 * in the separate `LoginAttempt` table, not in AuditLog. The only login-adjacent
 * entries here are the MFA challenge ones.
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  // Application
  APPLICATION_CREATED: "Application created",
  APPLICATION_KEY_CREATED: "API key created",
  APPLICATION_KEY_REVOKED: "API key revoked",

  // Email verification
  EMAIL_VERIFICATION_SENT: "Verification email sent",
  EMAIL_VERIFICATION_RESENT: "Verification email resent",
  EMAIL_VERIFIED: "Email verified",

  // Membership and invitations
  INVITATION_SENT: "Invitation sent",
  INVITATION_ACCEPTED: "Invitation accepted",
  INVITATION_REVOKED: "Invitation revoked",
  MEMBER_REMOVED: "Member removed",
  MEMBER_ROLE_UPDATED: "Member role changed",

  // Multi-factor authentication
  MFA_ENROLLMENT_STARTED: "Started MFA setup",
  MFA_ENABLED: "MFA enabled",
  MFA_CHALLENGE_ISSUED: "MFA challenge issued",
  MFA_CHALLENGE_SUCCESS: "Passed MFA challenge",
  MFA_CHALLENGE_FAILED: "Failed MFA challenge",
  MFA_RECOVERY_CODES_GENERATED: "Recovery codes generated",
  MFA_RECOVERY_CODE_USED: "Recovery code used",

  // Credentials and sessions
  PASSWORD_CHANGED: "Password changed",
  PASSWORD_RESET_REQUESTED: "Password reset requested",
  PASSWORD_RESET_COMPLETED: "Password reset completed",
  SESSIONS_REVOKED: "Sessions revoked",

  // Access control
  PERMISSION_DENIED: "Permission denied",
}

/** Every action the backend currently writes, for a filter dropdown. */
export const AUDIT_ACTIONS: readonly string[] = Object.keys(
  AUDIT_ACTION_LABELS,
).sort()

/**
 * "MEMBER_ROLE_UPDATED" -> "Member role updated" for anything not in the map,
 * so an unrecognised action degrades to something readable.
 */
export function auditActionLabel(action: string): string {
  const known = AUDIT_ACTION_LABELS[action]

  if (known) {
    return known
  }

  const words = action.toLowerCase().replace(/_/g, " ").trim()

  return words.charAt(0).toUpperCase() + words.slice(1)
}

export type AuditActorType = "USER" | "API_KEY" | "SYSTEM"

/**
 * How to describe who did something.
 *
 * A USER entry carries only a userId — this backend has no user lookup, the
 * same gap the Members tab documents — so the caller passes the signed-in
 * user's id to at least resolve their own actions to "You".
 */
export function auditActorLabel(
  actorType: AuditActorType,
  userId: string | null,
  currentUserId: string | null,
): string {
  if (actorType === "SYSTEM") {
    return "System"
  }

  if (actorType === "API_KEY") {
    return "API key"
  }

  if (userId && currentUserId && userId === currentUserId) {
    return "You"
  }

  return userId ?? "Unknown user"
}
