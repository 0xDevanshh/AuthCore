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
  | "EMAIL_VERIFIED"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET_COMPLETED"
  // No bulk-revocation event existed to reuse — reuse detection in
  // session.service.ts revokes a token family without writing an audit
  // row. Worth wiring that path into this action too, but that is a
  // change to the reuse flow, not to this one.
  | "SESSIONS_REVOKED";
