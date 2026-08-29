import {
  ipKeyGenerator,
  rateLimit,
} from "express-rate-limit";

import type { Request } from "express";

const commonOptions = {
  standardHeaders: true,
  legacyHeaders: false,
};

/**
 * NOTE — these limiters use the default in-memory store, so counters are
 * per-process and reset on restart. Adequate for a single instance;
 * anything behind more than one replica needs a shared store before these
 * numbers mean what they say.
 */

export const signupLimiter =
  rateLimit({
    ...commonOptions,

    windowMs:
      60 * 60 * 1000,

    max: 5,

    message: {
      success: false,

      message:
        "Too many signup attempts. Try again later.",
    },
  });

export const loginLimiter =
  rateLimit({
    ...commonOptions,

    windowMs:
      15 * 60 * 1000,

    max: 10,

    message: {
      success: false,

      message:
        "Too many login attempts. Try again later.",
    },
  });

export const refreshLimiter =
  rateLimit({
    ...commonOptions,

    windowMs:
      15 * 60 * 1000,

    max: 50,
  });

// The token is the only credential this route checks, so the endpoint is
// an unauthenticated guessing surface. 64 base64url characters is far out
// of brute-force reach, but the limit keeps the attempt volume bounded.
export const verifyEmailLimiter =
  rateLimit({
    ...commonOptions,

    windowMs:
      15 * 60 * 1000,

    max: 10,

    message: {
      success: false,

      message:
        "Too many verification attempts. Try again later.",
    },
  });

const HOUR_MS = 60 * 60 * 1000;

/**
 * Builds a limiter keyed on the email address in the request body.
 *
 * Every public endpoint that mails something to an address the caller
 * names needs this shape, so it is a helper rather than a copy per route:
 * resend-verification and forgot-password today, and any future
 * email-change confirmation.
 *
 * Keyed on the target address rather than the caller's IP, because the
 * abuse this guards against is bombing one inbox: an attacker with a pool
 * of IPs would sail past an IP-keyed limit while the victim collects the
 * mail. Scoped by application id too, so one tenant's traffic cannot
 * exhaust another's budget for the same address.
 *
 * `prefix` keeps each route's buckets separate — one address's
 * forgot-password budget must not be spent by its resend-verification
 * requests, or either endpoint could lock the other out.
 *
 * Requests with no usable email fall back to an IP key — those are
 * malformed bodies the validator will reject anyway, and they must not all
 * collide on one shared bucket.
 *
 * Counts every request, not just the ones that found an account. Skipping
 * the misses would make the limit itself an oracle for account existence,
 * undoing the generic response these endpoints are built around.
 */
function emailKeyedLimiter(options: {
  prefix: string;
  windowMs: number;
  max: number;
  message: string;
}) {
  return rateLimit({
    ...commonOptions,

    windowMs: options.windowMs,
    max: options.max,

    keyGenerator: (
      req: Request,
    ) => {
      const email =
        typeof req.body?.email ===
          "string"
          ? req.body.email
            .trim()
            .toLowerCase()
          : null;

      if (!email) {
        return `${options.prefix}:ip:${ipKeyGenerator(req.ip ?? "")}`;
      }

      return `${options.prefix}:${req.applicationId ?? "none"}:${email}`;
    },

    message: {
      success: false,
      message: options.message,
    },
  });
}

export const resendVerificationEmailLimiter =
  emailKeyedLimiter({
    prefix: "resend-verify",

    windowMs: HOUR_MS,
    max: 3,

    message:
      "Too many verification emails requested. Try again later.",
  });

/**
 * Companion IP limit, since the per-address bucket above caps abuse of any
 * one inbox but not a spray across many.
 */
export const resendVerificationIpLimiter =
  rateLimit({
    ...commonOptions,

    windowMs: HOUR_MS,

    max: 20,

    message: {
      success: false,

      message:
        "Too many verification emails requested. Try again later.",
    },
  });

export const forgotPasswordEmailLimiter =
  emailKeyedLimiter({
    prefix: "forgot-password",

    windowMs: HOUR_MS,
    max: 3,

    message:
      "Too many password reset requests. Try again later.",
  });

/**
 * Companion IP limit — see resendVerificationIpLimiter. Tighter than that
 * one: a reset link is a credential, so a spray of reset mail across many
 * addresses is worth cutting off sooner than a spray of verification mail.
 */
export const forgotPasswordIpLimiter =
  rateLimit({
    ...commonOptions,

    windowMs: HOUR_MS,

    max: 10,

    message: {
      success: false,

      message:
        "Too many password reset requests. Try again later.",
    },
  });

export const oauthLimiter =
  rateLimit({
    ...commonOptions,

    windowMs:
      15 * 60 * 1000,

    max: 30,
  });