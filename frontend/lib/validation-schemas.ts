import { z } from "zod"

/**
 * Client-side mirrors of `backend/src/validators/auth.validator.ts`.
 *
 * These exist so a user sees the same message before the round trip that the
 * server would send after it. The backend remains the authority — it re-validates
 * every request — so nothing here may be *looser* than the backend, or the API
 * will reject input the form accepted. If auth.validator.ts changes, change this
 * file in the same commit.
 *
 * Messages are copied verbatim from the backend so the wording does not shift
 * depending on which side caught the problem.
 */

/**
 * Backend: `.trim().email().transform(toLowerCase)`.
 *
 * The lowercasing is mirrored because the backend compares against a normalized
 * column; leaving it out would let "User@x.com" and "user@x.com" look like
 * different inputs on the client.
 */
const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .transform((value) => value.toLowerCase())

/**
 * The one password policy — mirrors `passwordSchema` in the backend validator:
 * 8–128 characters, with a lowercase letter, an uppercase letter, a number, and
 * a special character. Applies wherever a password is *set* (signup, reset).
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password cannot exceed 128 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/\d/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character")

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(50).optional(),
  lastName: z.string().trim().min(1).max(50).optional(),
})

/**
 * Login deliberately does NOT apply the password policy — matching the backend,
 * which bounds length only. Policy-checking an existing credential would reject
 * anyone whose password predates a tightening of the rules, telling them their
 * real password is invalid.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(128),
})

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, "Reset token is required").max(512),
  newPassword: passwordSchema,
})

/**
 * MFA challenge — the second half of a login.
 *
 * Note this is NOT a 6-digit-only rule, despite the field being labelled a
 * 6-digit code in the UI. The backend accepts either a TOTP code or a recovery
 * code here and validates only `min(1).max(64)`, leaving the service to decide
 * which kind it received. A `/^\d{6}$/` client rule would reject every recovery
 * code before it was ever sent — locking out exactly the users who have lost
 * their authenticator and need the fallback.
 */
export const mfaChallengeSchema = z.object({
  challengeToken: z.string().trim().min(1, "Challenge token is required").max(512),
  code: z
    .string()
    .trim()
    .min(1, "Enter your authenticator code or a recovery code")
    .max(64),
})

/**
 * TOTP *enrollment* confirmation, from the settings page. This one is
 * digits-only, mirroring the backend's `verifyTotpSetupSchema` — no recovery
 * code exists yet at enrollment time.
 */
export const verifyTotpSetupSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6,8}$/, "Enter the 6-digit code from your authenticator app"),
})

/** Mirrors `changePasswordSchema`: current is length-bounded, new faces the policy. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(128),
  newPassword: passwordSchema,
})

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type MfaChallengeInput = z.infer<typeof mfaChallengeSchema>
export type VerifyTotpSetupInput = z.infer<typeof verifyTotpSetupSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
