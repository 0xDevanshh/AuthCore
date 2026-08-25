import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .transform((value) =>
    value.toLowerCase(),
  );

const passwordSchema = z
  .string()
  .min(
    8,
    "Password must be at least 8 characters",
  )
  .max(
    128,
    "Password cannot exceed 128 characters",
  )
  .regex(
    /[a-z]/,
    "Password must contain a lowercase letter",
  )
  .regex(
    /[A-Z]/,
    "Password must contain an uppercase letter",
  )
  .regex(
    /\d/,
    "Password must contain a number",
  )
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain a special character",
  );

export const signupSchema = z.object({
  email: emailSchema,

  password: passwordSchema,

  firstName: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .optional(),

  lastName: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .optional(),
});

export const loginSchema = z.object({
  email: emailSchema,

  password: z
    .string()
    .min(1)
    .max(128),
});

export type SignupInput =
  z.infer<typeof signupSchema>;

export type LoginInput =
  z.infer<typeof loginSchema>;