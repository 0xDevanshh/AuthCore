import {
  AuditActorType,
  Prisma,
  TokenPurpose,
} from "@prisma/client";

import { prisma } from "../config/prisma.ts";
import { env } from "../config/env.ts";

import { generateOneTimeToken } from "../utils/token.ts";

import { logAuditEvent } from "./audit.service.ts";

/**
 * SCHEMA NOTES — read before extending this file.
 *
 * 1. There is no `emailVerified` / `emailVerifiedAt` column on `User`.
 *    Verification state lives on `UserEmail.verifiedAt` (nullable
 *    DateTime), one row per address, which is the right shape: a user may
 *    hold several addresses and verify them independently. "Unverified"
 *    is `verifiedAt: null`, which is what a freshly created UserEmail has
 *    — no default needs setting for signup to start out unverified.
 *    `getSafeUser` already projects this as `emailVerified: boolean` off
 *    the primary address.
 *
 * 2. `OneTimeToken.purpose` is the Prisma enum `TokenPurpose`, whose
 *    members are EMAIL_VERIFICATION, PASSWORD_RESET, EMAIL_CHANGE and
 *    MFA_CHALLENGE. EMAIL_VERIFICATION exists already, so no schema change
 *    is needed here. Note that invitations did NOT use this table — there
 *    is no INVITATION member and `OneTimeToken.userId` is a required FK
 *    that an unsigned-up invitee could not satisfy; invitations carry
 *    their own tokenHash on the `Invitation` row. See the header comment
 *    in invitation.service.ts.
 *
 * 3. `OneTimeToken.applicationId` is a required FK, so a token cannot be
 *    minted without knowing which application the signup arrived through.
 *    That is why this takes an applicationId alongside the userId — every
 *    end-user auth route runs behind `resolveApplication`, so the caller
 *    always has one.
 */

interface CreateEmailVerificationTokenOptions {
  /**
   * Address the token verifies, stored on `OneTimeToken.target` so the
   * verify endpoint can stamp the right `UserEmail.verifiedAt` even if the
   * user's primary address changes in the meantime.
   */
  target?: string | null;

  ipAddress?: string | null;
  userAgent?: string | null;

  /**
   * Mint the token inside an existing transaction, so it lives or dies
   * with the row it belongs to — signup passes the transaction that
   * created the User. Same contract as `logAuditEvent`.
   */
  tx?: Prisma.TransactionClient;
}

function verificationExpiry(): Date {
  return new Date(
    Date.now() +
      env.EMAIL_VERIFICATION_TTL_SECONDS * 1000,
  );
}

/**
 * Mints an email-verification token for a user.
 *
 * Only the HMAC hash reaches the database; `rawToken` is returned to the
 * caller once, for the caller to put in a verification link.
 *
 * Any unexpired, unused EMAIL_VERIFICATION token the user already holds is
 * consumed first, so at most one valid verification token exists per user
 * at any moment — a resend invalidates the previous link rather than
 * leaving two live ones. Superseded rows are stamped `usedAt` rather than
 * deleted, so audit entries stay resolvable and a spent link can still be
 * distinguished from one that never existed.
 *
 * Invalidation is deliberately NOT scoped to the application: the token
 * proves control of an email address, and identity is global in this
 * schema (see the note in auth.service.ts), so a live token issued through
 * App A would otherwise remain valid alongside one issued through App B.
 */
export async function createEmailVerificationToken(
  userId: string,
  applicationId: string,
  options: CreateEmailVerificationTokenOptions = {},
): Promise<{ rawToken: string }> {
  const token = generateOneTimeToken();

  const run = async (
    tx: Prisma.TransactionClient,
  ) => {
    const now = new Date();

    const superseded =
      await tx.oneTimeToken.updateMany({
        where: {
          userId,
          purpose: TokenPurpose.EMAIL_VERIFICATION,

          usedAt: null,
          expiresAt: { gt: now },
        },

        data: { usedAt: now },
      });

    const created = await tx.oneTimeToken.create({
      data: {
        applicationId,
        userId,

        purpose: TokenPurpose.EMAIL_VERIFICATION,

        tokenHash: token.hashedToken,

        target: options.target ?? null,

        expiresAt: verificationExpiry(),
      },
    });

    await logAuditEvent({
      tx,

      action: "EMAIL_VERIFICATION_SENT",
      actorType: AuditActorType.SYSTEM,

      applicationId,
      userId,

      resourceType: "OneTimeToken",
      resourceId: created.id,

      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,

      metadata: {
        target: options.target ?? null,
        expiresAt: created.expiresAt.toISOString(),
        supersededTokens: superseded.count,
      },
    });
  };

  if (options.tx) {
    await run(options.tx);
  } else {
    await prisma.$transaction(run);
  }

  return { rawToken: token.rawToken };
}
