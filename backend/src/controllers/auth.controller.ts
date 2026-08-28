import type {
  Request,
  Response,
} from "express";

import {
  loginSchema,
  signupSchema,
  verifyEmailSchema,
} from "../validators/auth.validator.ts";

import {
  verifyEmail,
} from "../services/verification.service.ts";

import {
  getSafeUser,
  login,
  signup,
} from "../services/auth.service.ts";

import {
  revokeSessionByRefreshToken,
  rotateRefreshToken,
} from "../services/session.service.ts";

import {
  clearAuthCookies,
  getRefreshTokenFromRequest,
  setAuthCookies,
} from "../utils/cookies.ts";

import {
  requireApplicationId,
} from "../middleware/resolveApplication.middleware.ts";

import { AppError } from "../utils/app-error.ts";

function requestMetadata(
  req: Request,
) {
  return {
    ipAddress:
      req.ip ?? null,

    userAgent:
      req.get("user-agent") ??
      null,

    applicationId:
      req.applicationId ?? null,
  };
}

export async function signupController(
  req: Request,
  res: Response,
) {
  const input =
    signupSchema.parse(req.body);

  const result =
    await signup(input, {
      applicationId:
        requireApplicationId(req),

      ipAddress:
        req.ip ?? null,

      userAgent:
        req.get("user-agent") ??
        null,
    });

  // Still 201 when the email failed — the account exists either way. The
  // message and `emailSent` are what tell the client to surface a resend
  // prompt. See the comment on the send in auth.service.ts.
  res.status(201).json({
    success: true,

    message: result.emailSent
      ? "Account created successfully"
      : "Account created, but the verification email could not be sent. You can request a new one.",

    data: {
      user: result.user,

      emailSent:
        result.emailSent,
    },
  });
}

/**
 * Public by design — the user arrives from a mail client and may hold no
 * session, so requireAuth would make the link unusable for exactly the
 * people it is sent to. The token is the credential.
 */
export async function verifyEmailController(
  req: Request,
  res: Response,
) {
  const input =
    verifyEmailSchema.parse(
      req.body,
    );

  const user =
    await verifyEmail(
      input.token,

      requireApplicationId(req),

      {
        ipAddress:
          req.ip ?? null,

        userAgent:
          req.get("user-agent") ??
          null,
      },
    );

  res.status(200).json({
    success: true,

    message:
      "Email verified successfully",

    data: {
      user,
    },
  });
}

export async function loginController(
  req: Request,
  res: Response,
) {
  const input =
    loginSchema.parse(req.body);

  const result =
    await login(
      input,
      requestMetadata(req),
    );

  setAuthCookies(
    res,
    result.tokens,
  );

  res.status(200).json({
    success: true,

    message:
      "Login successful",

    data: {
      user: result.user,
    },
  });
}

export async function refreshController(
  req: Request,
  res: Response,
) {
  const refreshToken =
    getRefreshTokenFromRequest(
      req,
    );

  if (!refreshToken) {
    throw new AppError(
      401,
      "Refresh token missing",
    );
  }

  const tokens =
    await rotateRefreshToken(
      refreshToken,
    );

  setAuthCookies(
    res,
    tokens,
  );

  res.status(200).json({
    success: true,
  });
}

export async function logoutController(
  req: Request,
  res: Response,
) {
  const refreshToken =
    getRefreshTokenFromRequest(
      req,
    );

  if (refreshToken) {
    await revokeSessionByRefreshToken(
      refreshToken,
    );
  }

  clearAuthCookies(res);

  res.status(200).json({
    success: true,

    message:
      "Logged out successfully",
  });
}

export async function meController(
  req: Request,
  res: Response,
) {
  if (!req.auth) {
    throw new AppError(
      401,
      "Authentication required",
    );
  }

  const user =
    await getSafeUser(
      req.auth.userId,
    );

  res.status(200).json({
    success: true,

    data: {
      user,
    },
  });
}