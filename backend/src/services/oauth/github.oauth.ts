import { env } from "../../config/env.js";

import { AppError } from "../../utils/app-error.js";

import type {
  OAuthIdentity,
} from "./google.oauth.js";

interface GitHubTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
}

interface GitHubProfile {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility:
    | string
    | null;
}

interface GitHubAuthorizationInput {
  state: string;
  codeChallenge: string;
}

const githubHeaders = {
  Accept:
    "application/vnd.github+json",

  "X-GitHub-Api-Version":
    "2022-11-28",

  "User-Agent": "AuthCore",
};

export function getGitHubAuthorizationUrl(
  input: GitHubAuthorizationInput,
): string {
  const url = new URL(
    "https://github.com/login/oauth/authorize",
  );

  url.searchParams.set(
    "client_id",
    env.GITHUB_CLIENT_ID,
  );

  url.searchParams.set(
    "redirect_uri",
    env.GITHUB_CALLBACK_URL,
  );

  url.searchParams.set(
    "scope",
    "read:user user:email",
  );

  url.searchParams.set(
    "state",
    input.state,
  );

  url.searchParams.set(
    "code_challenge",
    input.codeChallenge,
  );

  url.searchParams.set(
    "code_challenge_method",
    "S256",
  );

  return url.toString();
}

export async function exchangeGitHubCode(
  code: string,
  codeVerifier: string,
): Promise<OAuthIdentity> {
  const body =
    new URLSearchParams({
      client_id:
        env.GITHUB_CLIENT_ID,

      client_secret:
        env.GITHUB_CLIENT_SECRET,

      code,

      redirect_uri:
        env.GITHUB_CALLBACK_URL,

      code_verifier:
        codeVerifier,
    });

  const tokenResponse =
    await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",

        headers: {
          Accept:
            "application/json",

          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body,
      },
    );

  if (!tokenResponse.ok) {
    throw new AppError(
      401,
      "GitHub authentication failed",
    );
  }

  const tokenData =
    (await tokenResponse.json()) as
      GitHubTokenResponse;

  if (!tokenData.access_token) {
    throw new AppError(
      401,
      "GitHub did not return an access token",
    );
  }

  const authHeaders = {
    ...githubHeaders,

    Authorization: `Bearer ${tokenData.access_token}`,
  };

  const [
    profileResponse,
    emailResponse,
  ] = await Promise.all([
    fetch(
      "https://api.github.com/user",
      {
        headers: authHeaders,
      },
    ),

    fetch(
      "https://api.github.com/user/emails",
      {
        headers: authHeaders,
      },
    ),
  ]);

  if (
    !profileResponse.ok ||
    !emailResponse.ok
  ) {
    throw new AppError(
      401,
      "Unable to retrieve GitHub identity",
    );
  }

  const profile =
    (await profileResponse.json()) as
      GitHubProfile;

  const emails =
    (await emailResponse.json()) as
      GitHubEmail[];

  const selectedEmail =
    emails.find(
      (email) =>
        email.primary &&
        email.verified,
    ) ??
    emails.find(
      (email) =>
        email.verified,
    );

  if (!selectedEmail) {
    throw new AppError(
      401,
      "No verified email was returned by GitHub",
    );
  }

  const nameParts =
    profile.name
      ?.trim()
      .split(/\s+/) ?? [];

  const firstName =
    nameParts.length > 0
      ? nameParts[0]
      : undefined;

  const lastName =
    nameParts.length > 1
      ? nameParts
          .slice(1)
          .join(" ")
      : undefined;

  return {
    provider: "GITHUB",

    providerAccountId:
      String(profile.id),

    email:
      selectedEmail.email
        .trim()
        .toLowerCase(),

    firstName:
      firstName ?? null,
    lastName:
      lastName ?? null,

    avatarUrl:
      profile.avatar_url,

    scopes:
      tokenData.scope
        ?.split(/[,\s]+/)
        .filter(Boolean) ?? [],
  };
}