import {
  AuditActorType,
  Prisma,
  TokenPurpose,
} from "@prisma/client";

import { prisma } from "../config/prisma.ts";
import { env } from "../config/env.ts";
import { logger } from "../config/logger.ts";

import { AppError } from "../utils/app-error.ts";

import { hashPassword } from "../utils/password.ts";

import {
  generateOneTimeToken,
  hashOpaqueToken,
} from "../utils/token.ts";

import { revokeAllUserSessions } from "./session.service.ts";

import {
  buildPasswordResetUrl,
  sendPasswordResetEmail,
} from "../utils/email.ts";

import { logAuditEvent } from "./audit.service.ts";

function resetExpiry(): Date {
  return new Date(
    Date.now() +
      env.PASSWORD_RESET_TTL_SECONDS * 1000,
  );
}

/**
 * Mints a password-reset token, superseding any live one.
 *
 * Structurally identical to createEmailVerificationToken — same
 * OneTimeToken table, same one-live-token-per-user rule, same reason for
 * stamping `usedAt` on the old row rather than deleting it. Kept separate
 * rather than generalised over `purpose`, because the two differ in the
 * ways that matter: different TTLs, different targets, and the reset flow
 * will grow a check the verification flow must not have (see the next
 * prompt's password change, which has to revoke sessions).
 */
async function createPasswordResetToken(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    applicationId: string;
    target: string;
  },
): Promise<{
  rawToken: string;
  tokenId: string;
  supersededCount: number;
}> {
  const token = generateOneTimeToken();

  const now = new Date();

  const superseded =
    await tx.oneTimeToken.updateMany({
      where: {
        userId: params.userId,
        purpose: TokenPurpose.PASSWORD_RESET,

        usedAt: null,
        expiresAt: { gt: now },
      },

      data: { usedAt: now },
    });

  const created = await tx.oneTimeToken.create({
    data: {
      applicationId: params.applicationId,
      userId: params.userId,

      purpose: TokenPurpose.PASSWORD_RESET,

      tokenHash: token.hashedToken,

      target: params.target,

      expiresAt: resetExpiry(),
    },
  });

  return {
    rawToken: token.rawToken,
    tokenId: created.id,
    supersededCount: superseded.count,
  };
}

/**
 * Starts a password reset.
 *
 * ALWAYS resolves, and always the same way — unknown address, disabled
 * account, or a link genuinely sent. The endpoint is public, so any
 * observable difference between those cases turns it into an
 * account-existence oracle. Nothing here throws AppError for a miss:
 * there is no "not found" to report. See resendVerification, which this
 * mirrors deliberately.
 *
 * LOOKUP IS NOT SCOPED BY applicationId, and cannot be. Identity is global
 * in this schema — `UserEmail.normalized` is a plain `@unique`, and `User`
 * has no application column (see the note in auth.service.ts). Adding
 * `where: { applicationId }` would match nothing. The applicationId scopes
 * what it can: the new token's FK and the audit entry.
 *
 * KNOWN GAP — timing, exactly as in resendVerification: the miss path
 * skips a token write and a send, so it answers faster. The body leaks
 * nothing; the latency does.
 */
export async function requestPasswordReset(
  applicationId: string,
  email: string,
  metadata: {
    ipAddress?: string | null;
    userAgent?: string | null;
  } = {},
): Promise<void> {
  const normalizedEmail = email
    .trim()
    .toLowerCase();

  const userEmail =
    await prisma.userEmail.findUnique({
      where: { normalized: normalizedEmail },

      select: {
        id: true,
        email: true,
        userId: true,

        user: {
          select: {
            disabledAt: true,
            passwordHash: true,
          },
        },
      },
    });

  if (
    !userEmail ||
    userEmail.user.disabledAt
  ) {
    return;
  }

  // DELIBERATE — an OAuth-only account (passwordHash null) still gets a
  // link. Reset is the standard way to add password login to an account
  // that has none, and it is not a weakening: the link is proof of
  // control of the address, which is the same trust anchor the OAuth
  // provider's own reset would rest on. Flagged rather than silently
  // assumed, since the alternative — telling the user "you signed up with
  // Google" — is a legitimate product choice, and one that leaks which
  // provider an address is registered with.
  const isOAuthOnly =
    userEmail.user.passwordHash === null;

  const { rawToken, tokenId, supersededCount } =
    await prisma.$transaction((tx) =>
      createPasswordResetToken(tx, {
        userId: userEmail.userId,
        applicationId,
        target: normalizedEmail,
      }),
    );

  try {
    await sendPasswordResetEmail(
      userEmail.email,

      buildPasswordResetUrl(rawToken),
    );
  } catch (error) {
    // Swallowed, as in resendVerification: surfacing a send failure on a
    // public endpoint would answer "does this address exist?", since only
    // a real account ever reaches a send. sendEmail already logged the
    // transport error; this records which account is affected.
    //
    // The token stays live. It is unreachable without the email, and
    // consuming it here would leave the user unable to retry against a
    // token they never received.
    logger.error(
      {
        userId: userEmail.userId,
        err:
          error instanceof Error
            ? error.message
            : String(error),
      },
      "Password reset email failed to send",
    );

    return;
  }

  // Logged only on a real send — a request for an address with no account
  // did nothing worth recording, and writing one would put unverified
  // attacker-supplied addresses into the audit trail.
  await logAuditEvent({
    action: "PASSWORD_RESET_REQUESTED",
    actorType: AuditActorType.USER,

    applicationId,
    userId: userEmail.userId,

    resourceType: "OneTimeToken",
    resourceId: tokenId,

    ipAddress: metadata.ipAddress ?? null,
    userAgent: metadata.userAgent ?? null,

    metadata: {
      email: userEmail.email,
      supersededTokens: supersededCount,
      oauthOnlyAccount: isOAuthOnly,
    },
  });
}

const SERIALIZABLE = {
  isolationLevel:
    Prisma.TransactionIsolationLevel.Serializable,
} as const;

const RESET_REVOKE_REASON =
  "PASSWORD_RESET";

/**
 * Completes a password reset.
 *
 * Failure handling matches verifyEmail and acceptInvitation: a distinct
 * code per rejection so the frontend can offer the right next step —
 * request a new link, or go log in.
 *
 * THE SESSION REVOCATION IS THE POINT, not a tidy-up. A reset is what
 * someone does when they believe their account is compromised, and an
 * attacker who is already holding a valid session would otherwise keep it
 * after the password changed — the new password would lock out the owner's
 * future logins and nobody else. It runs inside the same transaction as
 * the password write, so there is no committed state in which the password
 * has changed but the old sessions are still live.
 *
 * NOT auto-logged-in. This deliberately issues no tokens; the user logs in
 * fresh with the new password. Auto-login after reset is a reasonable UX
 * improvement — it is what most consumer products do — and the pieces are
 * all here (`createSession` takes a userId), but it is out of scope for
 * this prompt. Whoever adds it should note that it would mean minting a
 * session for a request authenticated only by an emailed token, which is
 * a slightly different trust statement than the reset itself.
 *
 * MFA IS NOT CONSIDERED HERE. If the account carries an enrolled MFA
 * method, a reset by email alone still changes the password and still
 * revokes sessions. Whether a reset should require an MFA challenge, or
 * whether it should disenroll MFA, is Phase 7's decision — deliberately
 * untouched rather than guessed at.
 */
export async function resetPassword(
  rawToken: string,
  newPassword: string,
  applicationId: string,
  metadata: {
    ipAddress?: string | null;
    userAgent?: string | null;
  } = {},
): Promise<void> {
  const tokenHash = hashOpaqueToken(
    rawToken.trim(),
  );

  // Read the token BEFORE hashing the new password. Argon2id at 64MB and
  // t=3 is deliberately expensive, and this endpoint is public — hashing
  // first would let anyone spend that memory and CPU with a junk token.
  // The authoritative check is still the guarded update inside the
  // transaction below; this one only avoids the wasted work.
  const candidate =
    await prisma.oneTimeToken.findUnique({
      where: { tokenHash },

      select: {
        id: true,
        userId: true,
        purpose: true,
        usedAt: true,
        expiresAt: true,
      },
    });

  // A token of another purpose — an email verification, say — must not
  // set a password, and is reported as if it did not exist rather than
  // confirming some other token by that value is live.
  if (
    !candidate ||
    candidate.purpose !==
      TokenPurpose.PASSWORD_RESET
  ) {
    throw new AppError(
      400,
      "Password reset link is not valid",
      "RESET_TOKEN_NOT_FOUND",
    );
  }

  if (candidate.usedAt) {
    throw new AppError(
      400,
      "This password reset link has already been used",
      "RESET_TOKEN_ALREADY_USED",
    );
  }

  if (candidate.expiresAt <= new Date()) {
    throw new AppError(
      400,
      "This password reset link has expired",
      "RESET_TOKEN_EXPIRED",
    );
  }

  // Outside the transaction for the same reason: a ~100ms CPU-bound KDF
  // should not be run with a Serializable transaction held open.
  const passwordHash =
    await hashPassword(newPassword);

  const revokedSessions =
    await prisma.$transaction(async (tx) => {
      // Guarded on usedAt: null so two concurrent redemptions of the same
      // link cannot both set a password — the construction verifyEmail
      // and acceptInvitation use. This, not the read above, is what makes
      // the token single-use.
      const consumed =
        await tx.oneTimeToken.updateMany({
          where: {
            id: candidate.id,
            usedAt: null,
          },

          data: { usedAt: new Date() },
        });

      if (consumed.count !== 1) {
        throw new AppError(
          400,
          "This password reset link has already been used",
          "RESET_TOKEN_ALREADY_USED",
        );
      }

      await tx.user.update({
        where: { id: candidate.userId },
        data: { passwordHash },
      });

      // Same operation reuse detection performs, widened to the account.
      const revoked =
        await revokeAllUserSessions(
          candidate.userId,
          RESET_REVOKE_REASON,
          tx,
        );

      await logAuditEvent({
        tx,

        action: "PASSWORD_RESET_COMPLETED",
        actorType: AuditActorType.USER,

        applicationId,
        userId: candidate.userId,

        resourceType: "User",
        resourceId: candidate.userId,

        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,

        metadata: {
          tokenId: candidate.id,
          sessionsRevoked: revoked,
        },
      });

      // A separate entry from the reset itself: "every session died at
      // this moment" is the line someone reconstructing an incident looks
      // for, and it should be findable by action rather than by reading
      // the metadata of another event.
      await logAuditEvent({
        tx,

        action: "SESSIONS_REVOKED",
        actorType: AuditActorType.USER,

        applicationId,
        userId: candidate.userId,

        resourceType: "User",
        resourceId: candidate.userId,

        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,

        metadata: {
          reason: RESET_REVOKE_REASON,
          sessionsRevoked: revoked,
        },
      });

      return revoked;
    }, SERIALIZABLE);

  logger.info(
    {
      userId: candidate.userId,
      sessionsRevoked: revokedSessions,
    },
    "Password reset completed",
  );
}
