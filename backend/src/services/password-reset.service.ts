import {
  AuditActorType,
  Prisma,
  TokenPurpose,
} from "@prisma/client";

import { prisma } from "../config/prisma.ts";
import { env } from "../config/env.ts";
import { logger } from "../config/logger.ts";

import { generateOneTimeToken } from "../utils/token.ts";

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
