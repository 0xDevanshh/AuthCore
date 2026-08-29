import {
  Router,
} from "express";

import {
  changePasswordController,
  forgotPasswordController,
  loginController,
  logoutController,
  meController,
  refreshController,
  resendVerificationController,
  resetPasswordController,
  signupController,
  verifyEmailController,
} from "../controllers/auth.controller.ts";

import {
  githubCallbackController,
  githubStartController,
  googleCallbackController,
  googleStartController,
} from "../controllers/oauth.controller.ts";

import {
  asyncHandler,
} from "../utils/async-handler.ts";

import {
  requireAuth,
} from "../middleware/auth.middleware.ts";

import {
  verifyRequestOrigin,
} from "../middleware/origin.middleware.ts";

import {
  loginLimiter,
  oauthLimiter,
  refreshLimiter,
  forgotPasswordEmailLimiter,
  forgotPasswordIpLimiter,
  resendVerificationEmailLimiter,
  resendVerificationIpLimiter,
  resetPasswordLimiter,
  signupLimiter,
  verifyEmailLimiter,
} from "../middleware/rate-limit.middleware.ts";

import {
  resolveApplication,
  resolveApplicationFromRedirect,
} from "../middleware/resolveApplication.middleware.ts";

export const authRouter =
  Router();

authRouter.post(
  "/signup",

  verifyRequestOrigin,
  signupLimiter,
  resolveApplication,

  asyncHandler(
    signupController,
  ),
);

authRouter.post(
  "/login",

  verifyRequestOrigin,
  loginLimiter,
  resolveApplication,

  asyncHandler(
    loginController,
  ),
);

// Public: no requireAuth, because the link is clicked from a mail client
// where the user may hold no session. resolveApplication still applies —
// this is a data-plane action and the audit entry is scoped to the
// resolved application.
authRouter.post(
  "/verify-email",

  verifyRequestOrigin,
  verifyEmailLimiter,
  resolveApplication,

  asyncHandler(
    verifyEmailController,
  ),
);

// Public, like /verify-email: someone whose link expired has no session to
// authenticate with. resolveApplication still applies.
//
// Middleware order is load-bearing. The IP limiter runs first so a flood
// is dropped before it costs an API-key lookup; resolveApplication runs
// before the per-address limiter, whose key includes the resolved
// application id.
authRouter.post(
  "/resend-verification",

  verifyRequestOrigin,
  resendVerificationIpLimiter,
  resolveApplication,
  resendVerificationEmailLimiter,

  asyncHandler(
    resendVerificationController,
  ),
);

// Public, through resolveApplication — same shape as
// /resend-verification, including the load-bearing middleware order: IP
// limiter before the API-key lookup, per-address limiter after it, since
// its key includes the resolved application id.
authRouter.post(
  "/forgot-password",

  verifyRequestOrigin,
  forgotPasswordIpLimiter,
  resolveApplication,
  forgotPasswordEmailLimiter,

  asyncHandler(
    forgotPasswordController,
  ),
);

// Public, through resolveApplication — no requireAuth, since having no
// usable session is the premise of the whole flow.
authRouter.post(
  "/reset-password",

  verifyRequestOrigin,
  resetPasswordLimiter,
  resolveApplication,

  asyncHandler(
    resetPasswordController,
  ),
);

authRouter.post(
  "/refresh",

  verifyRequestOrigin,
  refreshLimiter,
  resolveApplication,

  asyncHandler(
    refreshController,
  ),
);

authRouter.post(
  "/logout",

  verifyRequestOrigin,
  resolveApplication,

  asyncHandler(
    logoutController,
  ),
);

// requireAuth, and no resolveApplication: the session is the credential
// here, not an API key. See the note on changePasswordController.
authRouter.post(
  "/change-password",

  verifyRequestOrigin,
  requireAuth,

  asyncHandler(
    changePasswordController,
  ),
);

authRouter.get(
  "/me",

  requireAuth,

  asyncHandler(
    meController,
  ),
);

// Google OAuth

authRouter.get(
  "/oauth/google",

  oauthLimiter,
  resolveApplicationFromRedirect,

  asyncHandler(
    googleStartController,
  ),
);

// No resolver: the provider redirects the browser here, so no API key can
// be presented. The application id is recovered from the signed OAuth
// state cookie instead.
authRouter.get(
  "/oauth/google/callback",

  oauthLimiter,

  asyncHandler(
    googleCallbackController,
  ),
);

// GitHub OAuth

authRouter.get(
  "/oauth/github",

  oauthLimiter,
  resolveApplicationFromRedirect,

  asyncHandler(
    githubStartController,
  ),
);

// No resolver — see the Google callback note above.
authRouter.get(
  "/oauth/github/callback",

  oauthLimiter,

  asyncHandler(
    githubCallbackController,
  ),
);