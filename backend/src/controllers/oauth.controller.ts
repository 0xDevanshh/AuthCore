import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { env } from "../config/env.ts";
import { logger } from "../config/logger.ts";

import {
  createOAuthState,
  verifyOAuthState,
} from "../utils/oauth-state.ts";

import {
  clearOAuthStateCookie,
  cookieNames,
  setAuthCookies,
  setOAuthStateCookie,
} from "../utils/cookies.ts";

import {
  getGoogleAuthorizationUrl,
  exchangeGoogleCode,
} from "../services/oauth/google.oauth.ts";

import {
  getGitHubAuthorizationUrl,
  exchangeGitHubCode,
} from "../services/oauth/github.oauth.ts";

import {
  loginWithOAuth,
} from "../services/oauth.service.ts";

function requestMetadata(
  req: Request,
) {
  return {
    ipAddress:
      req.ip ?? null,

    userAgent:
      req.get("user-agent") ??
      null,
  };
}

function queryString(
  value: unknown,
): string | undefined {
  return typeof value === "string"
    ? value
    : undefined;
}

function oauthFailureUrl() {
  return new URL(
    "/login?error=oauth_failed",
    env.FRONTEND_URL,
  ).toString();
}

function oauthSuccessUrl() {
  return new URL(
    "/auth/callback",
    env.FRONTEND_URL,
  ).toString();
}

export async function googleStartController(
  _req: Request,
  res: Response,
) {
  const oauth =
    createOAuthState("GOOGLE");

  setOAuthStateCookie(
    res,
    oauth.cookieToken,
  );

  const authorizationUrl =
    getGoogleAuthorizationUrl({
      state: oauth.state,

      nonce: oauth.nonce,

      codeChallenge:
        oauth.codeChallenge,
    });

  res.redirect(
    authorizationUrl,
  );
}

export async function googleCallbackController(
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  try {
    if (
      queryString(
        req.query.error,
      )
    ) {
      clearOAuthStateCookie(res);

      return res.redirect(
        oauthFailureUrl(),
      );
    }

    const code =
      queryString(
        req.query.code,
      );

    const state =
      queryString(
        req.query.state,
      );

    if (!code) {
      throw new Error(
        "Google authorization code missing",
      );
    }

    const stored =
      verifyOAuthState(
        req.cookies?.[
          cookieNames.oauthState
        ],

        state,

        "GOOGLE",
      );

    const identity =
      await exchangeGoogleCode(
        code,

        stored.codeVerifier,

        stored.nonce,
      );

    const result =
      await loginWithOAuth(
        identity,
        requestMetadata(req),
      );

    clearOAuthStateCookie(res);

    setAuthCookies(
      res,
      result.tokens,
    );

    return res.redirect(
      oauthSuccessUrl(),
    );
  } catch (error) {
    clearOAuthStateCookie(res);

    logger.warn(
      {
        err: error,
        provider: "google",
      },
      "Google OAuth callback failed",
    );

    return res.redirect(
      oauthFailureUrl(),
    );
  }
}

export async function githubStartController(
  _req: Request,
  res: Response,
) {
  const oauth =
    createOAuthState("GITHUB");

  setOAuthStateCookie(
    res,
    oauth.cookieToken,
  );

  const authorizationUrl =
    getGitHubAuthorizationUrl({
      state: oauth.state,

      codeChallenge:
        oauth.codeChallenge,
    });

  res.redirect(
    authorizationUrl,
  );
}

export async function githubCallbackController(
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  try {
    if (
      queryString(
        req.query.error,
      )
    ) {
      clearOAuthStateCookie(res);

      return res.redirect(
        oauthFailureUrl(),
      );
    }

    const code =
      queryString(
        req.query.code,
      );

    const state =
      queryString(
        req.query.state,
      );

    if (!code) {
      throw new Error(
        "GitHub authorization code missing",
      );
    }

    const stored =
      verifyOAuthState(
        req.cookies?.[
          cookieNames.oauthState
        ],

        state,

        "GITHUB",
      );

    const identity =
      await exchangeGitHubCode(
        code,

        stored.codeVerifier,
      );

    const result =
      await loginWithOAuth(
        identity,
        requestMetadata(req),
      );

    clearOAuthStateCookie(res);

    setAuthCookies(
      res,
      result.tokens,
    );

    return res.redirect(
      oauthSuccessUrl(),
    );
  } catch (error) {
    clearOAuthStateCookie(res);

    logger.warn(
      {
        err: error,
        provider: "github",
      },
      "GitHub OAuth callback failed",
    );

    return res.redirect(
      oauthFailureUrl(),
    );
  }
}