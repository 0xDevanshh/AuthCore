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

export const authRouter =
  Router();

authRouter.post(
  "/signup",

  verifyRequestOrigin,
  signupLimiter,

  asyncHandler(
    signupController,
  ),
);

authRouter.post(
  "/login",

  verifyRequestOrigin,
  loginLimiter,

  asyncHandler(
    loginController,
  ),
);

authRouter.post(
  "/refresh",

  verifyRequestOrigin,
  refreshLimiter,

  asyncHandler(
    refreshController,
  ),
);

authRouter.post(
  "/logout",

  verifyRequestOrigin,

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

  asyncHandler(
    googleStartController,
  ),
);

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

  asyncHandler(
    githubStartController,
  ),
);

authRouter.get(
  "/oauth/github/callback",

  oauthLimiter,

  asyncHandler(
    githubCallbackController,
  ),
);