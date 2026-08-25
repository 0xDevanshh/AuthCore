import {
  createRemoteJWKSet,
  jwtVerify,
} from "jose";

import { env } from "../../config/env.ts";

import { AppError } from "../../utils/app-error.ts";

interface GoogleAuthorizationInput {
  state: string;
  nonce: string;
  codeChallenge: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

export interface OAuthIdentity {
  provider:
    | "GOOGLE"
    | "GITHUB";

  providerAccountId: string;

  email: string;

  firstName?: string | null;
  lastName?: string | null;

  avatarUrl?: string | null;

  scopes: string[];
}

const GOOGLE_JWKS =
  createRemoteJWKSet(
    new URL(
      "https://www.googleapis.com/oauth2/v3/certs",
    ),
  );

export function getGoogleAuthorizationUrl(
  input: GoogleAuthorizationInput,
): string {
  const url = new URL(
    "https://accounts.google.com/o/oauth2/v2/auth",
  );

  url.searchParams.set(
    "client_id",
    env.GOOGLE_CLIENT_ID,
  );

  url.searchParams.set(
    "redirect_uri",
    env.GOOGLE_CALLBACK_URL,
  );

  url.searchParams.set(
    "response_type",
    "code",
  );

  url.searchParams.set(
    "scope",
    "openid email profile",
  );

  url.searchParams.set(
    "state",
    input.state,
  );

  url.searchParams.set(
    "nonce",
    input.nonce,
  );

  url.searchParams.set(
    "code_challenge",
    input.codeChallenge,
  );

  url.searchParams.set(
    "code_challenge_method",
    "S256",
  );

  url.searchParams.set(
    "access_type",
    "online",
  );

  url.searchParams.set(
    "include_granted_scopes",
    "true",
  );

  url.searchParams.set(
    "prompt",
    "select_account",
  );

  return url.toString();
}

export async function exchangeGoogleCode(
  code: string,
  codeVerifier: string,
  expectedNonce: string,
): Promise<OAuthIdentity> {
  const body =
    new URLSearchParams({
      client_id:
        env.GOOGLE_CLIENT_ID,

      client_secret:
        env.GOOGLE_CLIENT_SECRET,

      code,

      code_verifier:
        codeVerifier,

      grant_type:
        "authorization_code",

      redirect_uri:
        env.GOOGLE_CALLBACK_URL,
    });

  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },

      body,
    },
  );

  if (!response.ok) {
    throw new AppError(
      401,
      "Google authentication failed",
    );
  }

  const tokens =
    (await response.json()) as
      GoogleTokenResponse;

  if (!tokens.id_token) {
    throw new AppError(
      401,
      "Google did not return an ID token",
    );
  }

  let payload;

  try {
    const result =
      await jwtVerify(
        tokens.id_token,
        GOOGLE_JWKS,
        {
          issuer: [
            "https://accounts.google.com",
            "accounts.google.com",
          ],

          audience:
            env.GOOGLE_CLIENT_ID,
        },
      );

    payload = result.payload;
  } catch {
    throw new AppError(
      401,
      "Invalid Google identity token",
    );
  }

  if (
    payload.nonce !==
    expectedNonce
  ) {
    throw new AppError(
      401,
      "Invalid Google OAuth nonce",
    );
  }

  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !==
      "string"
  ) {
    throw new AppError(
      401,
      "Google account is missing required identity information",
    );
  }

  if (
    payload.email_verified !== true
  ) {
    throw new AppError(
      401,
      "Google email is not verified",
    );
  }

  return {
    provider: "GOOGLE",

    providerAccountId:
      payload.sub,

    email:
      payload.email
        .trim()
        .toLowerCase(),

    firstName:
      typeof payload.given_name ===
      "string"
        ? payload.given_name
        : null,

    lastName:
      typeof payload.family_name ===
      "string"
        ? payload.family_name
        : null,

    avatarUrl:
      typeof payload.picture ===
      "string"
        ? payload.picture
        : null,

    scopes: [
      "openid",
      "email",
      "profile",
    ],
  };
}