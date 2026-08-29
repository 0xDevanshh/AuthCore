import type {
  Request,
  Response,
} from "express";

import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
  verifyTotpSetupSchema,
} from "../validators/auth.validator.ts";

import {
  requestPasswordReset,
  resetPassword,
} from "../services/password-reset.service.ts";

import {
  resendVerification,
  verifyEmail,
} from "../services/verification.service.ts";

import {
  getSafeUser,
  login,
  signup,
} from "../services/auth.service.ts";

import {
  changePassword,
} from "../services/user.service.ts";

import {
  enrollTotp,
  verifyTotpSetup,
} from "../services/mfa.service.ts";

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

/**
 * ONE RESPONSE, ALWAYS.
 *
 * This body is returned whether the address is unknown, already verified,
 * or genuinely resent — and `resendVerification` never throws, so there is
 * no error branch that could differ either. Do not add one: any variation
 * here (a 404, a different message, a count) tells an unauthenticated
 * caller which addresses hold accounts.
 */
export async function resendVerificationController(
  req: Request,
  res: Response,
) {
  const input =
    resendVerificationSchema.parse(
      req.body,
    );

  await resendVerification(
    requireApplicationId(req),

    input.email,

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
      "If an account exists for that address, a verification email has been sent.",
  });
}

/**
 * ONE RESPONSE, ALWAYS — see resendVerificationController. The same rule
 * applies with more force here: this endpoint is the classic probe for
 * "which of these addresses has an account", and `requestPasswordReset`
 * never throws, so there is no error branch that could differ. Do not add
 * one.
 */
export async function forgotPasswordController(
  req: Request,
  res: Response,
) {
  const input =
    forgotPasswordSchema.parse(
      req.body,
    );

  await requestPasswordReset(
    requireApplicationId(req),

    input.email,

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
      "If an account with that email exists, a password reset link has been sent.",
  });
}

/**
 * Public — the user has no session at this point, which is the whole
 * premise of forgot-password. The token is the credential.
 *
 * Unlike forgot-password, this one DOES report failures distinctly: the
 * caller already holds a token, so telling them it expired leaks nothing
 * about which accounts exist, and "request a new link" is the only useful
 * thing to say.
 *
 * No tokens are issued and no cookies are set — the user logs in fresh.
 * See the note on resetPassword about auto-login.
 */
export async function resetPasswordController(
  req: Request,
  res: Response,
) {
  const input =
    resetPasswordSchema.parse(
      req.body,
    );

  await resetPassword(
    input.token,

    input.newPassword,

    requireApplicationId(req),

    {
      ipAddress:
        req.ip ?? null,

      userAgent:
        req.get("user-agent") ??
        null,
    },
  );

  // Any session the client still holds was just revoked server-side;
  // clearing the cookies keeps the browser from presenting a dead token
  // on the next request.
  clearAuthCookies(res);

  res.status(200).json({
    success: true,

    message:
      "Password reset successfully. You can now log in with your new password.",
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

/**
 * requireAuth, not resolveApplication: this is the user acting on their
 * own account from a settings page, authenticated by their session. There
 * is no API key in play — `req.auth.applicationId` carries whichever
 * application the session belongs to, and that is what the audit entry is
 * scoped to.
 */
export async function changePasswordController(
  req: Request,
  res: Response,
) {
  if (!req.auth) {
    throw new AppError(
      401,
      "Authentication required",
    );
  }

  const input =
    changePasswordSchema.parse(
      req.body,
    );

  await changePassword(
    req.auth.userId,

    input.currentPassword,

    input.newPassword,

    {
      // Spares the session this request arrived on — see changePassword.
      currentSessionId:
        req.auth.sessionId,

      applicationId:
        req.auth.applicationId,

      ipAddress:
        req.ip ?? null,

      userAgent:
        req.get("user-agent") ??
        null,
    },
  );

  // No new cookies: the current session survives the change, so the
  // tokens the browser already holds stay valid.
  res.status(200).json({
    success: true,

    message:
      "Password changed successfully. Other devices have been signed out.",
  });
}

/**
 * requireAuth — a user setting up a second factor on their own account,
 * authenticated by the session they already hold.
 *
 * The response body carries the TOTP secret, in the clear, twice over (the
 * QR data URL encodes it too). That is unavoidable — enrollment does not
 * work otherwise — but it means this response must never be cached or
 * logged, hence the explicit no-store.
 */
export async function enrollTotpController(
  req: Request,
  res: Response,
) {
  if (!req.auth) {
    throw new AppError(
      401,
      "Authentication required",
    );
  }

  const enrollment =
    await enrollTotp(
      req.auth.userId,

      {
        applicationId:
          req.auth.applicationId,

        ipAddress:
          req.ip ?? null,

        userAgent:
          req.get("user-agent") ??
          null,
      },
    );

  res.set(
    "Cache-Control",
    "no-store",
  );

  res.status(201).json({
    success: true,

    message:
      "Scan the QR code with your authenticator app, then confirm a code to finish setup.",

    data: {
      secret:
        enrollment.secret,

      qrCodeDataUrl:
        enrollment.qrCodeDataUrl,

      // Explicit so the client does not present this as done. The method
      // is inert until the confirmation step passes.
      verified: false,
    },
  });
}

/**
 * Confirms enrollment. requireAuth, same as the enroll step.
 *
 * Note what this does NOT do: it issues no new tokens and does not touch
 * the session. The user was already authenticated before enrolling, and
 * turning on a second factor does not re-authenticate them. Login-time
 * MFA is the next prompt's work.
 */
export async function verifyTotpSetupController(
  req: Request,
  res: Response,
) {
  if (!req.auth) {
    throw new AppError(
      401,
      "Authentication required",
    );
  }

  const input =
    verifyTotpSetupSchema.parse(
      req.body,
    );

  await verifyTotpSetup(
    req.auth.userId,

    input.code,

    {
      applicationId:
        req.auth.applicationId,

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
      "Two-factor authentication is now enabled for your account.",

    data: {
      verified: true,
    },
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