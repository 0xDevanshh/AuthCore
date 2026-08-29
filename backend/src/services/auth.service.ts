import {
  Prisma,
} from "@prisma/client";

import { prisma } from "../config/prisma.ts";

import {
  hashPassword,
  verifyPassword,
} from "../utils/password.ts";

import { AppError } from "../utils/app-error.ts";

import {
  createSession,
} from "./session.service.ts";

import {
  createEmailVerificationToken,
} from "./verification.service.ts";

import {
  buildEmailVerificationUrl,
  sendVerificationEmail,
} from "../utils/email.ts";

import { logger } from "../config/logger.ts";

import {
  getActiveTotpMethod,
  issueMfaChallenge,
} from "./mfa.service.ts";

/**
 * OPEN QUESTION — MFA and OAuth login.
 *
 * This gate is on the password path only. `loginWithOAuth` in
 * oauth.service.ts still issues a session directly, so a user with TOTP
 * enrolled who signs in with Google today skips their second factor
 * entirely.
 *
 * That is NOT obviously wrong, which is exactly why it is left alone
 * here. Google has already applied whatever second factor the user has on
 * that account, so demanding a TOTP code on top can be redundant friction
 * — and a user who enrolled TOTP for password login may not think of it
 * as guarding their Google button. But the two are not equivalent: the
 * AuthCore TOTP method is a factor this system controls and can reason
 * about, whereas "Google says so" is an assertion about a third-party
 * account whose own MFA posture is unknown and can be weakened without
 * anyone here noticing.
 *
 * The three defensible answers are: always challenge, never challenge,
 * or make it an application-level setting. Picking one silently would
 * bake a security posture into the product as a side effect of a prompt
 * about password login, so it is deliberately left open. Whoever decides
 * should also settle what happens to an account whose ONLY login method
 * is OAuth — enrolling TOTP there currently guards nothing.
 */

// Lives in user.service.ts so verification.service.ts can return the same
// /me shape without a circular import; re-exported here because callers
// (and the rest of this file) have always reached for it through
// auth.service.
import { getSafeUser } from "./user.service.ts";

export { getSafeUser };
export type { SafeUser } from "./user.service.ts";

import type {
  LoginInput,
  SignupInput,
} from "../validators/auth.validator.ts";

interface SessionMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;

  applicationId?: string | null;
}

/**
 * Signup needs a definite applicationId, unlike login: the
 * `OneTimeToken` row backing email verification carries a required
 * `applicationId` FK. Every end-user auth route runs behind
 * `resolveApplication`, so the controller always has one.
 */
interface SignupMetadata {
  applicationId: string;

  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * NOTE — identity is GLOBAL, not per-application.
 *
 * The schema does not make this obvious, so stating it explicitly rather
 * than guessing: `User` has no `applicationId` column, and `UserEmail`
 * declares `email` and `normalized` as plain `@unique` — not
 * `@@unique([applicationId, normalized])`. `User.username` is globally
 * unique too. An application is linked to a user only through
 * `Membership`.
 *
 * Consequences of the schema as written:
 *   - One email address means one User row across the entire platform.
 *   - A person signing up to App A and App B with the same email gets a
 *     single shared User, and App B's signup collides with App A's.
 *   - Therefore user lookups here are deliberately NOT scoped by
 *     applicationId. Adding `where: { applicationId }` to these queries
 *     would silently match nothing, since the column does not exist.
 *
 * If tenants are meant to have isolated user pools, that is a schema
 * change (move the unique constraint onto
 * `@@unique([applicationId, normalized])`) plus a migration — not a query
 * change. Flagged for a decision before this is built on further.
 */

/**
 * Creates an account and mints its email-verification token.
 *
 * NOT blocked on verification, by design: the new user's primary
 * `UserEmail.verifiedAt` starts null and nothing in signup or login
 * consults it yet. Whether unverified accounts are gated — and out of
 * which features — is a product decision, deliberately left for a later
 * phase; this only guarantees the address starts unverified and a live
 * token exists for it.
 *
 * Returns `emailSent` alongside the user so the caller can tell whether
 * the verification link actually went out — see the send below.
 */
export async function signup(
  input: SignupInput,
  metadata: SignupMetadata,
) {
  const normalizedEmail =
    input.email
      .trim()
      .toLowerCase();

  const existingEmail =
    await prisma.userEmail.findUnique({
      where: {
        normalized:
          normalizedEmail,
      },

      select: {
        id: true,
      },
    });

  if (existingEmail) {
    throw new AppError(
      409,
      "An account with this email already exists",
      "EMAIL_ALREADY_EXISTS",
    );
  }

  const passwordHash =
    await hashPassword(
      input.password,
    );

  try {
    const { user, rawToken } =
      await prisma.$transaction(
        async (tx) => {
          const createdUser =
            await tx.user.create({
              data: {
                firstName:
                  input.firstName ?? null,

                lastName:
                  input.lastName ?? null,

                passwordHash,
              },
            });

          await tx.userEmail.create({
            data: {
              userId:
                createdUser.id,

              email:
                normalizedEmail,

              normalized:
                normalizedEmail,

              isPrimary: true,

              // Unverified until the token minted below is redeemed.
              verifiedAt: null,
            },
          });

          // Inside the transaction so an account can never be created
          // without its verification token, or vice versa.
          const verification =
            await createEmailVerificationToken(
              createdUser.id,

              metadata.applicationId,

              {
                tx,

                target:
                  normalizedEmail,

                ipAddress:
                  metadata.ipAddress ??
                  null,

                userAgent:
                  metadata.userAgent ??
                  null,
              },
            );

          return {
            user: createdUser,

            rawToken:
              verification.rawToken,
          };
        },
      );

    // Sent after commit, not inside the transaction: an email cannot be
    // rolled back, so a send that succeeded followed by a transaction
    // that failed would leave a live link to an account that does not
    // exist.
    //
    // DELIBERATE — a failed send does NOT fail signup.
    //
    // The account and its verification token are already committed, and
    // Prompt 5.3's resend endpoint can mint a fresh link at any time. So
    // the only thing a rejected send costs is one email, whereas throwing
    // here would return 500 for an account that was in fact created —
    // leaving the user unable to sign up again (the address is taken) and
    // unable to log in if verification is ever gated. Degrading beats
    // that. `emailSent: false` tells the client to offer "resend".
    //
    // Do not "fix" this by rethrowing without also making signup roll the
    // user back, which it deliberately does not.
    let emailSent = true;

    try {
      await sendVerificationEmail(
        normalizedEmail,

        buildEmailVerificationUrl(
          rawToken,
        ),
      );
    } catch (error) {
      emailSent = false;

      // sendEmail already logged the transport failure; this records the
      // consequence — which account is now sitting on an unsent link.
      logger.error(
        {
          userId: user.id,
          err:
            error instanceof Error
              ? error.message
              : String(error),
        },
        "Signup succeeded but verification email failed to send",
      );
    }

    return {
      user: await getSafeUser(
        user.id,
      ),

      emailSent,
    };
  } catch (error) {
    if (
      error instanceof
      Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AppError(
        409,
        "An account with this email already exists",
        "EMAIL_ALREADY_EXISTS",
      );
    }

    throw error;
  }
}

export async function login(
  input: LoginInput,
  metadata: SessionMetadata,
) {
  const normalizedEmail =
    input.email
      .trim()
      .toLowerCase();

  const emailRecord =
    await prisma.userEmail.findUnique({
      where: {
        normalized:
          normalizedEmail,
      },

      include: {
        user: true,
      },
    });

  // Same response whether email exists or not.
  if (
    !emailRecord ||
    !emailRecord.user.passwordHash
  ) {
    throw new AppError(
      401,
      "Invalid email or password",
      "INVALID_CREDENTIALS",
    );
  }

  const passwordValid =
    await verifyPassword(
      emailRecord.user.passwordHash,
      input.password,
    );

  if (!passwordValid) {
    throw new AppError(
      401,
      "Invalid email or password",
      "INVALID_CREDENTIALS",
    );
  }

  if (
    emailRecord.user.disabledAt
  ) {
    throw new AppError(
      403,
      "Account is disabled",
      "ACCOUNT_DISABLED",
    );
  }

  // THE PASSWORD IS NOT THE WHOLE LOGIN ANY MORE.
  //
  // A user with a verified, enabled TOTP method gets a challenge instead
  // of a session — no access token, no refresh token, no user record.
  // Everything below this point is the second half of the login, and it
  // lives in completeMfaLogin.
  const totpMethod =
    await getActiveTotpMethod(
      emailRecord.user.id,
    );

  if (totpMethod) {
    // OneTimeToken.applicationId is a required FK, so a challenge cannot
    // be minted without one. Every end-user auth route runs behind
    // resolveApplication, so this is a wiring error rather than something
    // a client can trigger.
    if (!metadata.applicationId) {
      throw new AppError(
        401,
        "Missing API key",
        "API_KEY_MISSING",
      );
    }

    const challenge =
      await issueMfaChallenge(
        emailRecord.user.id,

        metadata.applicationId,

        {
          ipAddress:
            metadata.ipAddress ?? null,

          userAgent:
            metadata.userAgent ?? null,
        },
      );

    // Deliberately no user object. The caller has proven the password but
    // not the second factor, and profile data — name, avatar, email
    // addresses — is not something a half-authenticated request should
    // be able to read. The challenge token and its expiry are the only
    // things the client needs to render a code prompt.
    return {
      mfaRequired: true as const,

      challengeToken:
        challenge.challengeToken,

      expiresAt: challenge.expiresAt,
    };
  }

  const tokens =
    await createSession(
      emailRecord.user.id,
      metadata,
    );

  const user =
    await getSafeUser(
      emailRecord.user.id,
    );

  return {
    mfaRequired: false as const,
    user,
    tokens,
  };
}