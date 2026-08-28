/**
 * Actions recorded in the AuditLog table.
 *
 * Kept as a string union rather than a Prisma enum so new actions can be
 * added without a migration; AuditLog.action is a plain String column.
 */
export type AuditAction =
  | "APPLICATION_CREATED"
  | "APPLICATION_KEY_CREATED"
  | "APPLICATION_KEY_REVOKED"
  | "PERMISSION_DENIED"
  | "MEMBER_ROLE_UPDATED"
  | "MEMBER_REMOVED"
  | "INVITATION_SENT"
  | "INVITATION_ACCEPTED"
  | "INVITATION_REVOKED"
  | "EMAIL_VERIFICATION_SENT"
  | "EMAIL_VERIFICATION_RESENT"
  | "EMAIL_VERIFIED";
