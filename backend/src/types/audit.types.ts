/**
 * Actions recorded in the AuditLog table.
 *
 * Kept as a string union rather than a Prisma enum so new actions can be
 * added without a migration; AuditLog.action is a plain String column.
 */
/**
 * The catalog as a runtime value.
 *
 * `AuditAction` is derived from this rather than declared separately, so the
 * list a query filter validates against cannot drift from the list the writers
 * are type-checked against — adding an action in one place adds it in both.
 */
export const AUDIT_ACTIONS = [
  "APPLICATION_CREATED",
  "APPLICATION_KEY_CREATED",
  "APPLICATION_KEY_REVOKED",
  "PERMISSION_DENIED",
  "MEMBER_ROLE_UPDATED",
  "MEMBER_REMOVED",
  "INVITATION_SENT",
  "INVITATION_ACCEPTED",
  "INVITATION_REVOKED",
  "EMAIL_VERIFICATION_SENT",
  "EMAIL_VERIFICATION_RESENT",
  "EMAIL_VERIFIED",
  "MFA_ENROLLMENT_STARTED",
  "MFA_ENABLED",
  // Security-sensitive: worth being loud about, since it's the kind of event
  // that should stand out to anyone reviewing an account's history — a second
  // factor going away is exactly the moment an attacker with partial access
  // would want to create.
  "MFA_DISABLED",
  "MFA_CHALLENGE_ISSUED",
  "MFA_CHALLENGE_SUCCESS",
  "MFA_CHALLENGE_FAILED",
  "MFA_RECOVERY_CODES_GENERATED",
  // Worth alerting on, not just recording: a recovery code being spent
  // usually means the user lost their authenticator device — or that
  // someone else has their printout.
  "MFA_RECOVERY_CODE_USED",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  // No bulk-revocation event existed to reuse — reuse detection in
  // session.service.ts revokes a token family without writing an audit
  // row. Worth wiring that path into this action too, but that is a
  // change to the reuse flow, not to this one.
  "SESSIONS_REVOKED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Narrows an arbitrary string to a known action. */
export function isAuditAction(
  value: string,
): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(
    value,
  );
}

/**
 * Page size bounds for the audit log listing.
 *
 * Here rather than in audit.service.ts so the request validator can import them
 * without pulling the Prisma client into its module graph.
 */
export const AUDIT_LOG_DEFAULT_LIMIT = 20;
export const AUDIT_LOG_MAX_LIMIT = 100;
