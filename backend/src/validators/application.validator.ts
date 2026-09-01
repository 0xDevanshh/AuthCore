import { z } from "zod";

import {
  AUDIT_ACTIONS,
  AUDIT_LOG_DEFAULT_LIMIT,
  AUDIT_LOG_MAX_LIMIT,
} from "../types/audit.types.ts";

export const createApplicationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Application name is required")
    .max(80, "Application name cannot exceed 80 characters"),
});

export const applicationIdParamSchema = z.object({
  id: z.string().trim().min(1).max(64),
});

export type CreateApplicationInput = z.infer<
  typeof createApplicationSchema
>;

export const createApiKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Key name cannot be empty")
    .max(80, "Key name cannot exceed 80 characters")
    .optional(),

  expiresAt: z.coerce
    .date()
    .refine(
      (value) => value.getTime() > Date.now(),
      "Expiry must be in the future",
    )
    .optional(),
});

export const apiKeyIdParamSchema = z.object({
  id: z.string().trim().min(1).max(64),
  keyId: z.string().trim().min(1).max(64),
});

export type CreateApiKeyInput = z.infer<
  typeof createApiKeySchema
>;

export const membershipIdParamSchema = z.object({
  id: z.string().trim().min(1).max(64),
  membershipId: z.string().trim().min(1).max(64),
});

export const updateMemberRoleSchema = z.object({
  roleId: z.string().trim().min(1).max(64),
});

export type UpdateMemberRoleInput = z.infer<
  typeof updateMemberRoleSchema
>;

export const sendInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .transform((value) => value.toLowerCase()),

  roleId: z.string().trim().min(1).max(64),
});

export type SendInvitationInput = z.infer<
  typeof sendInvitationSchema
>;

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(1, "Invitation token is required").max(512),
});

export const invitationIdParamSchema = z.object({
  id: z.string().trim().min(1).max(64),
  invitationId: z.string().trim().min(1).max(64),
});

/**
 * Query string for the audit log listing.
 *
 * `limit` is rejected rather than silently clamped when it exceeds the maximum:
 * a caller asking for 500 rows has a wrong expectation, and quietly returning
 * 100 would leave them believing they had seen everything.
 */
export const listAuditLogsQuerySchema = z.object({
  cursor: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .optional(),

  limit: z.coerce
    .number()
    .int("Limit must be a whole number")
    .min(1, "Limit must be at least 1")
    .max(
      AUDIT_LOG_MAX_LIMIT,
      `Limit cannot exceed ${AUDIT_LOG_MAX_LIMIT}`,
    )
    .default(AUDIT_LOG_DEFAULT_LIMIT),

  // Constrained to the known catalog so a typo returns a validation error
  // rather than an empty page that looks like "no matching activity".
  action: z
    .enum(AUDIT_ACTIONS)
    .optional(),
});

export type ListAuditLogsQuery = z.infer<
  typeof listAuditLogsQuerySchema
>;
