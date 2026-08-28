import {
  rateLimit,
} from "express-rate-limit";

const commonOptions = {
  standardHeaders: true,
  legacyHeaders: false,
};

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

export const oauthLimiter =
  rateLimit({
    ...commonOptions,

    windowMs:
      15 * 60 * 1000,

    max: 30,
  });