import type {
  CookieOptions,
  Request,
  Response,
} from "express";

import { env } from "../config/env.ts";

const production =
  env.NODE_ENV === "production";

const prefix = production
  ? "__Host-"
  : "";

export const cookieNames = {
  access: `${prefix}ac_access`,
  refresh: `${prefix}ac_refresh`,
  oauthState: `${prefix}ac_oauth_state`,
};

const baseCookieOptions: CookieOptions = {
  httpOnly: true,

  secure: production,

  sameSite: "lax",

  path: "/",
};

export function setAuthCookies(
  res: Response,
  tokens: {
    accessToken: string;
    refreshToken: string;
  },
): void {
  res.cookie(
    cookieNames.access,
    tokens.accessToken,
    {
      ...baseCookieOptions,

      maxAge:
        env.ACCESS_TOKEN_TTL_SECONDS *
        1000,
    },
  );

  res.cookie(
    cookieNames.refresh,
    tokens.refreshToken,
    {
      ...baseCookieOptions,

      maxAge:
        env.REFRESH_TOKEN_TTL_SECONDS *
        1000,
    },
  );
}

export function clearAuthCookies(
  res: Response,
): void {
  res.clearCookie(
    cookieNames.access,
    baseCookieOptions,
  );

  res.clearCookie(
    cookieNames.refresh,
    baseCookieOptions,
  );
}

export function getRefreshTokenFromRequest(
  req: Request,
): string | null {
  const value =
    req.cookies?.[cookieNames.refresh];

  return typeof value === "string"
    ? value
    : null;
}

export function setOAuthStateCookie(
  res: Response,
  value: string,
): void {
  res.cookie(
    cookieNames.oauthState,
    value,
    {
      ...baseCookieOptions,

      maxAge: 10 * 60 * 1000,
    },
  );
}

export function clearOAuthStateCookie(
  res: Response,
): void {
  res.clearCookie(
    cookieNames.oauthState,
    baseCookieOptions,
  );
}