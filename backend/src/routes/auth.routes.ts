import {
  Router,
} from "express";

import {
  loginController,
  logoutController,
  meController,
  refreshController,
  signupController,
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
  signupLimiter,
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