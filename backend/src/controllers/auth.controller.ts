import type {
  Request,
  Response,
} from "express";

import {
  loginSchema,
  signupSchema,
} from "../validators/auth.validator.ts";

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

  const user =
    await signup(input);

  res.status(201).json({
    success: true,

    message:
      "Account created successfully",

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