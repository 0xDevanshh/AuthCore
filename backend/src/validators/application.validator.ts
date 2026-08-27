import { z } from "zod";

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
