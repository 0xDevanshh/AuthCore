import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(8000),

  DATABASE_URL: z.string().min(1),

  FRONTEND_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default("authcore"),
  JWT_AUDIENCE: z.string().default("authcore-web"),

  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900),

  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(2592000),

  TOKEN_HASH_SECRET: z.string().min(32),

  OAUTH_STATE_SECRET: z.string().min(32),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().url(),

  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_CALLBACK_URL: z.string().url(),

  INVITATION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(604800), // 7 days

  RESEND_API_KEY: z.string().min(1),

  // Full RFC 5322 sender, e.g. "AuthCore <noreply@yourdomain.com>". The
  // domain must be verified in Resend or every send is rejected.
  EMAIL_FROM: z.string().min(1),

  // Deliberately shorter than INVITATION_TTL_SECONDS: a verification link
  // is mailed to an address the account is actively waiting on, so it is
  // acted on within minutes, and a shorter window narrows the exposure if
  // the mailbox is later compromised.
  EMAIL_VERIFICATION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(86400), // 24 hours

  // Shorter again than EMAIL_VERIFICATION_TTL_SECONDS: a live reset link
  // is a standing credential for the account, so it should not sit unused
  // for a day the way a verification link harmlessly can.
  PASSWORD_RESET_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(3600), // 1 hour

  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error(
    "Invalid environment configuration:",
    result.error.flatten().fieldErrors,
  );

  process.exit(1);
}

export const env = result.data;