import {
  createHash,
  randomBytes,
} from "node:crypto";

import jwt, {
  type JwtPayload,
} from "jsonwebtoken";

import { env } from "../config/env.ts";
import { AppError } from "./app-error.ts";

export type OAuthProviderName =
  | "GOOGLE"
  | "GITHUB";

interface OAuthStatePayload
  extends JwtPayload {
  state: string;
  provider: OAuthProviderName;
  codeVerifier: string;
  nonce: string;
}

export interface OAuthState {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  nonce: string;
  cookieToken: string;
}

function randomValue(): string {
  return randomBytes(32).toString(
    "base64url",
  );
}

export function createOAuthState(
  provider: OAuthProviderName,
): OAuthState {
  const state = randomValue();

  const nonce = randomValue();

  const codeVerifier =
    randomBytes(64).toString("base64url");

  const codeChallenge = createHash(
    "sha256",
  )
    .update(codeVerifier)
    .digest("base64url");

  const cookieToken = jwt.sign(
    {
      state,
      provider,
      codeVerifier,
      nonce,
    },
    env.OAUTH_STATE_SECRET,
    {
      algorithm: "HS256",

      expiresIn: 10 * 60,

      issuer: "authcore",
      audience: "authcore-oauth-state",
    },
  );

  return {
    state,
    nonce,
    codeVerifier,
    codeChallenge,
    cookieToken,
  };
}

export function verifyOAuthState(
  cookieToken: string | undefined,
  returnedState: string | undefined,
  expectedProvider: OAuthProviderName,
): OAuthStatePayload {
  if (
    !cookieToken ||
    !returnedState
  ) {
    throw new AppError(
      400,
      "Invalid OAuth state",
    );
  }

  let payload: OAuthStatePayload;

  try {
    payload = jwt.verify(
      cookieToken,
      env.OAUTH_STATE_SECRET,
      {
        algorithms: ["HS256"],
        issuer: "authcore",
        audience: "authcore-oauth-state",
      },
    ) as OAuthStatePayload;
  } catch {
    throw new AppError(
      400,
      "OAuth state expired or invalid",
    );
  }

  if (
    payload.state !== returnedState ||
    payload.provider !==
      expectedProvider
  ) {
    throw new AppError(
      400,
      "OAuth state mismatch",
    );
  }

  return payload;
}