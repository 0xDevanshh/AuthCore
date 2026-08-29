import {
  AuditActorType,
  Prisma,
} from "@prisma/client";

import { prisma } from "../config/prisma.ts";
import { logger } from "../config/logger.ts";

import { AppError } from "../utils/app-error.ts";

import {
  hashPassword,
  verifyPassword,
} from "../utils/password.ts";

import { logAuditEvent } from "./audit.service.ts";

import { revokeAllUserSessions } from "./session.service.ts";

/**
 * The public projection of a user — what /me returns.
 *
 * Extracted from auth.service.ts so verification.service.ts can return the
 * same shape without the two modules importing each other in a cycle.
 * auth.service.ts re-exports it, so existing callers are unaffected.
 *
 * Note what is deliberately absent: `passwordHash`, and every column that
 * is not the user's own business — `lastLoginAt`, `updatedAt`, the OAuth
 * account tokens, sessions, MFA secrets. `disabledAt` is selected only to
 * keep the query shape stable; it is not part of the returned object.
 */
export interface SafeUser {
  id: string;

  firstName: string | null;
  lastName: string | null;

  username: string | null;

  avatarUrl: string | null;

  email: string | null;
  emailVerified: boolean;

  createdAt: Date;
}

export async function getSafeUser(
  userId: string,
): Promise<SafeUser> {
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

const SERIALIZABLE = {
  isolationLevel:
    Prisma.TransactionIsolationLevel.Serializable,
} as const;

const CHANGE_REVOKE_REASON =
  "PASSWORD_CHANGED";

/**
 * Changes the password of a logged-in user who knows their current one.
 *
 * Lives here rather than in password-reset.service.ts because it shares
 * that flow's mechanics but none of its premise: there is no emailed
 * token, no account-existence secrecy to preserve, and no anonymous
 * caller. This is an authenticated mutation of the user's own record.
 *
 * DIFFERS FROM resetPassword IN ONE WAY THAT MATTERS: it spares the
 * session making the request. Every other session dies — a password
 * change is the second-most common response to "someone else is in my
 * account", after a reset — but signing the user out of the settings page
 * they are standing on is a bug, not a security measure.
 *
 * MFA IS NOT CONSIDERED HERE, exactly as in resetPassword. Whether a
 * password change should require an MFA challenge is Phase 7's decision.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  options: {
    /**
     * Session to keep alive — the one this request authenticated with.
     * Omitted or null revokes every session, matching reset.
     */
    currentSessionId?: string | null;

    applicationId?: string | null;

    ipAddress?: string | null;
    userAgent?: string | null;
  } = {},
): Promise<void> {
  const user =
    await prisma.user.findUnique({
      where: { id: userId },

      select: {
        id: true,
        passwordHash: true,
        disabledAt: true,
      },
    });

  // 401 rather than 404: the caller authenticated, so the only thing this
  // can mean is that the credential no longer holds.
  if (!user || user.disabledAt) {
    throw new AppError(
      401,
      "Authentication required",
      "INVALID_CREDENTIALS",
    );
  }

  // An OAuth-only account has no current password to check, so this
  // endpoint cannot serve it — there is nothing to verify against, and
  // accepting the change without a check would let anyone holding a
  // session set a password. Such a user adds one through forgot-password,
  // which proves control of the address instead. See the note in
  // requestPasswordReset.
  if (!user.passwordHash) {
    throw new AppError(
      400,
      "This account has no password set. Use the password reset flow to add one.",
      "NO_PASSWORD_SET",
    );
  }

  const currentValid =
    await verifyPassword(
      user.passwordHash,
      currentPassword,
    );

  if (!currentValid) {
    throw new AppError(
      401,
      "Current password is incorrect",
      "INVALID_CREDENTIALS",
    );
  }

  // Rejected before any work is done, and distinctly from a wrong current
  // password: re-submitting the existing password is a mistake worth
  // naming, and silently accepting it would revoke every other session
  // while changing nothing.
  const unchanged = await verifyPassword(
    user.passwordHash,
    newPassword,
  );

  if (unchanged) {
    throw new AppError(
      400,
      "New password must be different from the current one",
      "PASSWORD_UNCHANGED",
    );
  }

  // Outside the transaction — argon2id at 64MB and t=3 should not be run
  // with a Serializable transaction held open. Same reasoning as
  // resetPassword.
  const passwordHash =
    await hashPassword(newPassword);

  const revokedSessions =
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      const revoked =
        await revokeAllUserSessions(
          user.id,
          CHANGE_REVOKE_REASON,
          tx,
          options.currentSessionId ?? null,
        );

      await logAuditEvent({
        tx,

        action: "PASSWORD_CHANGED",
        actorType: AuditActorType.USER,

        applicationId:
          options.applicationId ?? null,

        userId: user.id,

        resourceType: "User",
        resourceId: user.id,

        ipAddress: options.ipAddress ?? null,
        userAgent: options.userAgent ?? null,

        metadata: {
          sessionsRevoked: revoked,

          currentSessionPreserved: Boolean(
            options.currentSessionId,
          ),
        },
      });

      if (revoked > 0) {
        // Separate entry, as in resetPassword — "every other session died
        // at this moment" should be findable by action.
        await logAuditEvent({
          tx,

          action: "SESSIONS_REVOKED",
          actorType: AuditActorType.USER,

          applicationId:
            options.applicationId ?? null,

          userId: user.id,

          resourceType: "User",
          resourceId: user.id,

          ipAddress: options.ipAddress ?? null,
          userAgent: options.userAgent ?? null,

          metadata: {
            reason: CHANGE_REVOKE_REASON,
            sessionsRevoked: revoked,
          },
        });
      }

      return revoked;
    }, SERIALIZABLE);

  logger.info(
    {
      userId: user.id,
      sessionsRevoked: revokedSessions,
    },
    "Password changed",
  );
}
