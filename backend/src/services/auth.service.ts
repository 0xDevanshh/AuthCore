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
  sendEmailVerificationEmail,
} from "../utils/email.ts";

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

export async function getSafeUser(
  userId: string,
) {
  const user =
    await prisma.user.findUnique({
      where: {
        id: userId,
      },

      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        avatarUrl: true,
        createdAt: true,
        disabledAt: true,

        emails: {
          where: {
            isPrimary: true,
          },

          select: {
            email: true,
            verifiedAt: true,
          },

          take: 1,
        },
      },
    });

  if (!user) {
    throw new AppError(
      404,
      "User not found",
    );
  }

  const primaryEmail =
    user.emails[0] ?? null;

  return {
    id: user.id,

    firstName: user.firstName,
    lastName: user.lastName,

    username: user.username,

    avatarUrl: user.avatarUrl,

    email:
      primaryEmail?.email ??
      null,

    emailVerified:
      Boolean(
        primaryEmail?.verifiedAt,
      ),

    createdAt: user.createdAt,
  };
}

/**
 * Creates an account and mints its email-verification token.
 *
 * NOT blocked on verification, by design: the new user's primary
 * `UserEmail.verifiedAt` starts null and nothing in signup or login
 * consults it yet. Whether unverified accounts are gated — and out of
 * which features — is a product decision, deliberately left for a later
 * phase; this only guarantees the address starts unverified and a live
 * token exists for it.
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

    // After commit — see the TODO(email) in utils/email.ts. No transport
    // exists yet, so this logs the link outside production instead of
    // sending it, matching the invitation flow.
    sendEmailVerificationEmail({
      to: normalizedEmail,

      verifyUrl:
        buildEmailVerificationUrl(
          rawToken,
        ),
    });

    return getSafeUser(user.id);
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
    user,
    tokens,
  };
}