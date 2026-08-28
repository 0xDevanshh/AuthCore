import { prisma } from "../config/prisma.ts";

import { AppError } from "../utils/app-error.ts";

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
