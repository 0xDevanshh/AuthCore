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

const RESEND_VERIFICATION_MESSAGE = {
  success: false,

  message:
    "Too many verification emails requested. Try again later.",
};

/**
 * Per-address limit on resend-verification.
 *
 * Keyed on the target address rather than the caller's IP, because the
 * abuse this guards against is email-bombing one inbox: an attacker with a
 * pool of IPs would sail past an IP-keyed limit while the victim collects
 * the mail. Scoped by application id too, so one tenant's traffic cannot
 * exhaust another's budget for the same address.
 *
 * Requests with no usable email fall back to an IP key — those are
 * malformed bodies that the validator will reject anyway, and they must
 * not all collide on one shared bucket.
 *
 * Counted on every request, not just successful ones: skipping the ones
 * that found no account would make the limit itself an oracle for account
 * existence, undoing the generic response this endpoint is built around.
 */
export const resendVerificationEmailLimiter =
  rateLimit({
    ...commonOptions,

    windowMs:
      60 * 60 * 1000,

    max: 3,

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
        return `resend-verify:ip:${ipKeyGenerator(req.ip ?? "")}`;
      }

      return `resend-verify:${req.applicationId ?? "none"}:${email}`;
    },

    message:
      RESEND_VERIFICATION_MESSAGE,
  });

/**
 * Companion IP limit, since the per-address bucket above caps abuse of any
 * one inbox but not a spray across many.
 */
export const resendVerificationIpLimiter =
  rateLimit({
    ...commonOptions,

    windowMs:
      60 * 60 * 1000,

    max: 20,

    message:
      RESEND_VERIFICATION_MESSAGE,
  });

export const oauthLimiter =
  rateLimit({
    ...commonOptions,

    windowMs:
      15 * 60 * 1000,

    max: 30,
  });