import {
  AuditActorType,
  Prisma,
  TokenPurpose,
} from "@prisma/client";

import { prisma } from "../config/prisma.ts";
import { env } from "../config/env.ts";

import { AppError } from "../utils/app-error.ts";

import {
  generateOneTimeToken,
  hashOpaqueToken,
} from "../utils/token.ts";

import { logAuditEvent } from "./audit.service.ts";

import {
  getSafeUser,
  type SafeUser,
} from "./user.service.ts";

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

const SERIALIZABLE = {
  isolationLevel:
    Prisma.TransactionIsolationLevel.Serializable,
} as const;

/**
 * Redeems an email-verification token.
 *
 * Mirrors acceptInvitation's failure handling: each rejection carries its
 * own code so the frontend can offer the right next step — resend the
 * link, prompt a login, or say the address is already confirmed.
 *
 * TODO(gating): nothing in this codebase consults `UserEmail.verifiedAt`
 * to allow or deny anything. Whether unverified users may log in, hold a
 * session, accept invitations, or reach application routes is an open
 * product decision, deliberately not guessed at here. Two known places
 * that will want revisiting once it is made:
 *   - `login` in auth.service.ts, which does not check verification.
 *   - `acceptInvitation` in invitation.service.ts, whose header note
 *     already flags that it matches an invitee's address regardless of
 *     `verifiedAt`, and that tightening it to `verifiedAt: { not: null }`
 *     is a one-line change once this flow exists. It now exists.
 *
 * TODO(tenancy): the token's own `applicationId` is not required to match
 * the application the redemption arrives through. Identity is global (see
 * the note in auth.service.ts), so a user reaching App B's API key with a
 * link minted through App A is verifying their own address either way, and
 * the token is opaque and single-use — nothing cross-tenant is granted.
 * Rejecting the mismatch is defensible too; both ids are recorded in the
 * audit metadata so the decision can be made against real traffic rather
 * than guessed at now.
 */
export async function verifyEmail(
  rawToken: string,
  applicationId: string,
  metadata: {
    ipAddress?: string | null;
    userAgent?: string | null;
  } = {},
): Promise<SafeUser> {
  const tokenHash = hashOpaqueToken(
    rawToken.trim(),
  );

  const userId = await prisma.$transaction(
    async (tx) => {
      const token =
        await tx.oneTimeToken.findUnique({
          where: { tokenHash },

          select: {
            id: true,
            userId: true,
            applicationId: true,
            purpose: true,
            target: true,
            usedAt: true,
            expiresAt: true,
          },
        });

      // A token of another purpose — a password reset, say — must not
      // verify an address, and is reported as if it did not exist rather
      // than confirming that some other token by that value is live.
      if (
        !token ||
        token.purpose !==
          TokenPurpose.EMAIL_VERIFICATION
      ) {
        throw new AppError(
          400,
          "Verification link is not valid",
          "VERIFICATION_TOKEN_NOT_FOUND",
        );
      }

      if (token.usedAt) {
        throw new AppError(
          400,
          "This verification link has already been used",
          "VERIFICATION_TOKEN_ALREADY_USED",
        );
      }

      if (token.expiresAt <= new Date()) {
        throw new AppError(
          400,
          "This verification link has expired",
          "VERIFICATION_TOKEN_EXPIRED",
        );
      }

      // `target` records the address the token was minted for, so a user
      // who has since added or changed addresses verifies the right row.
      // Tokens predating that field fall back to the primary address.
      const userEmail =
        await tx.userEmail.findFirst({
          where: token.target
            ? {
                userId: token.userId,
                normalized: token.target,
              }
            : {
                userId: token.userId,
                isPrimary: true,
              },

          select: {
            id: true,
            email: true,
            verifiedAt: true,
          },
        });

      if (!userEmail) {
        throw new AppError(
          400,
          "The address this link was sent to is no longer on the account",
          "VERIFICATION_EMAIL_MISSING",
        );
      }

      // Guarded on usedAt: null so two concurrent redemptions of the same
      // link cannot both succeed — the same construction acceptInvitation
      // uses on `acceptedAt`.
      const consumed =
        await tx.oneTimeToken.updateMany({
          where: {
            id: token.id,
            usedAt: null,
          },

          data: { usedAt: new Date() },
        });

      if (consumed.count !== 1) {
        throw new AppError(
          400,
          "This verification link has already been used",
          "VERIFICATION_TOKEN_ALREADY_USED",
        );
      }

      // There is no User.emailVerified column — verification state is
      // UserEmail.verifiedAt, one row per address. An address verified
      // earlier keeps its original timestamp rather than being restamped.
      const verifiedAt =
        userEmail.verifiedAt ?? new Date();

      if (!userEmail.verifiedAt) {
        await tx.userEmail.update({
          where: { id: userEmail.id },
          data: { verifiedAt },
        });
      }

      await logAuditEvent({
        tx,

        action: "EMAIL_VERIFIED",
        actorType: AuditActorType.USER,

        applicationId,
        userId: token.userId,

        resourceType: "UserEmail",
        resourceId: userEmail.id,

        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,

        metadata: {
          email: userEmail.email,
          verifiedAt: verifiedAt.toISOString(),
          tokenId: token.id,

          // See TODO(tenancy) above.
          tokenApplicationId: token.applicationId,
        },
      });

      return token.userId;
    },
    SERIALIZABLE,
  );

  // Same projection as /me — no passwordHash, no session or MFA data.
  return getSafeUser(userId);
}
