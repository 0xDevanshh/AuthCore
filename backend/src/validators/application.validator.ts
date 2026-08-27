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
