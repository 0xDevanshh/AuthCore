import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .transform((value) =>
    value.toLowerCase(),
  );

/**
 * The one password policy. Exported so every path that sets a password —
 * signup, reset, and any future change-password — enforces exactly these
 * rules; a second copy would drift the moment one of them is tightened.
 */
export const passwordSchema = z
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

export const verifyEmailSchema = z.object({
  // Base64url of 48 random bytes — 64 characters. Bounded so a huge body
  // is rejected before it reaches an HMAC.
  token: z
    .string()
    .trim()
    .min(1, "Verification token is required")
    .max(512),
});

export const resendVerificationSchema =
  z.object({
    email: emailSchema,
  });

export const forgotPasswordSchema =
  z.object({
    email: emailSchema,
  });

const totpCodeSchema = z
  .string()
  .trim()
  .regex(
    /^\d{6,8}$/,
    "Enter the 6-digit code from your authenticator app",
  );

export const mfaChallengeSchema =
  z.object({
    challengeToken: z
      .string()
      .trim()
      .min(1, "Challenge token is required")
      .max(512),

    // NOT totpCodeSchema — the challenge endpoint accepts either a TOTP
    // code or a recovery code, and a digits-only rule would reject every
    // recovery code before the service ever saw it. The service decides
    // which kind it is; this only bounds the length.
    code: z
      .string()
      .trim()
      .min(1, "Enter your authenticator code or a recovery code")
      .max(64),
  });

export const verifyTotpSetupSchema =
  z.object({
    // Digits only, but the length is not pinned to 6 — the service owns
    // the TOTP parameters, and a validator that hardcoded 6 would
    // silently start rejecting valid codes if that ever changed.
    code: totpCodeSchema,
  });

export const changePasswordSchema =
  z.object({
    // Only length-bounded, not policy-checked: this is an existing
    // credential being presented, and running it through passwordSchema
    // would reject anyone whose password predates a tightening of the
    // rules — telling them their real password is invalid.
    currentPassword: z
      .string()
      .min(1, "Current password is required")
      .max(128),

    // The new one does face the full policy — same schema as signup.
    newPassword: passwordSchema,
  });

export const resetPasswordSchema =
  z.object({
    token: z
      .string()
      .trim()
      .min(1, "Reset token is required")
      .max(512),

    // Same passwordSchema signup uses — see the note on it.
    newPassword: passwordSchema,
  });

export type SignupInput =
  z.infer<typeof signupSchema>;

export type ResendVerificationInput =
  z.infer<typeof resendVerificationSchema>;

export type ForgotPasswordInput =
  z.infer<typeof forgotPasswordSchema>;

export type ResetPasswordInput =
  z.infer<typeof resetPasswordSchema>;

export type ChangePasswordInput =
  z.infer<typeof changePasswordSchema>;

export type VerifyTotpSetupInput =
  z.infer<typeof verifyTotpSetupSchema>;

export type MfaChallengeInput =
  z.infer<typeof mfaChallengeSchema>;

export type VerifyEmailInput =
  z.infer<typeof verifyEmailSchema>;

export type LoginInput =
  z.infer<typeof loginSchema>;