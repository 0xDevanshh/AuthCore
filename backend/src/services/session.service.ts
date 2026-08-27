import {
  Prisma,
} from "@prisma/client";

import {
  randomUUID,
} from "node:crypto";

import { prisma } from "../config/prisma.ts";
import { env } from "../config/env.ts";

import { AppError } from "../utils/app-error.ts";

import {
  generateOpaqueToken,
  hashOpaqueToken,
} from "../utils/token.ts";

import {
  signAccessToken,
} from "../utils/jwt.ts";

interface SessionMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;

  /**
   * Application the request arrived through, resolved from the API key.
   * Null only for sessions created outside an application context.
   */
  applicationId?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

class RefreshReuseDetected extends Error { }

function refreshExpiry(): Date {
  return new Date(
    Date.now() +
    env.REFRESH_TOKEN_TTL_SECONDS *
    1000,
  );
}

export async function createSession(
  userId: string,
  metadata: SessionMetadata,
): Promise<AuthTokens> {
  const rawRefreshToken =
    generateOpaqueToken();

  const refreshTokenHash =
    hashOpaqueToken(rawRefreshToken);

  const familyId = randomUUID();

  const expiresAt =
    refreshExpiry();

  const session =
    await prisma.$transaction(
      async (tx) => {
        const createdSession =
          await tx.session.create({
            data: {
              userId,

              applicationId:
                metadata.applicationId ??
                null,

              ipAddress:
                metadata.ipAddress ??
                null,

              userAgent:
                metadata.userAgent ??
                null,

              expiresAt,
            },
          });

        await tx.refreshToken.create({
          data: {
            sessionId:
              createdSession.id,

            tokenHash:
              refreshTokenHash,

            familyId,

            expiresAt,
          },
        });

        await tx.user.update({
          where: {
            id: userId,
          },

          data: {
            lastLoginAt:
              new Date(),
          },
        });

        return createdSession;
      },
    );

  const accessToken =
    signAccessToken({
      userId,
      sessionId: session.id,
      applicationId:
        session.applicationId,
    });

  return {
    accessToken,
    refreshToken:
      rawRefreshToken,
  };
}

async function revokeFamily(
  familyId: string,
  sessionId: string,
): Promise<void> {
  const now = new Date();

  await prisma.$transaction([
    prisma.refreshToken.updateMany({
      where: {
        familyId,
        revokedAt: null,
      },

      data: {
        revokedAt: now,
      },
    }),

    prisma.session.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
      },

      data: {
        revokedAt: now,
        revokeReason:
          "REFRESH_TOKEN_REUSE",
      },
    }),
  ]);
}

export async function rotateRefreshToken(
  rawRefreshToken: string,
): Promise<AuthTokens> {
  const tokenHash =
    hashOpaqueToken(rawRefreshToken);

  const current =
    await prisma.refreshToken.findUnique({
      where: {
        tokenHash,
      },

      include: {
        session: {
          include: {
            user: true,
          },
        },
      },
    });

  if (!current) {
    throw new AppError(
      401,
      "Invalid refresh token",
    );
  }

  const now = new Date();

  if (current.usedAt) {
    await revokeFamily(
      current.familyId,
      current.sessionId,
    );

    throw new AppError(
      401,
      "Refresh token reuse detected",
    );
  }

  if (
    current.revokedAt ||
    current.expiresAt <= now ||
    current.session.revokedAt ||
    current.session.expiresAt <= now
  ) {
    throw new AppError(
      401,
      "Refresh token expired or revoked",
    );
  }

  if (
    current.session.user.disabledAt
  ) {
    await revokeFamily(
      current.familyId,
      current.sessionId,
    );

    throw new AppError(
      403,
      "Account is disabled",
    );
  }

  const nextRawToken =
    generateOpaqueToken();

  const nextTokenHash =
    hashOpaqueToken(nextRawToken);

  const nextExpiry =
    refreshExpiry();

  try {
    await prisma.$transaction(
      async (tx) => {
        const consumed =
          await tx.refreshToken.updateMany({
            where: {
              id: current.id,

              usedAt: null,
              revokedAt: null,
            },

            data: {
              usedAt: now,
            },
          });

        if (consumed.count !== 1) {
          throw new RefreshReuseDetected();
        }

        await tx.refreshToken.create({
          data: {
            sessionId:
              current.sessionId,

            tokenHash:
              nextTokenHash,

            familyId:
              current.familyId,

            parentTokenId:
              current.id,

            expiresAt:
              nextExpiry,
          },
        });

        await tx.session.update({
          where: {
            id: current.sessionId,
          },

          data: {
            lastActiveAt: now,
          },
        });
      },
    );
  } catch (error) {
    const uniqueRace =
      error instanceof
      Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002";

    if (
      error instanceof
      RefreshReuseDetected ||
      uniqueRace
    ) {
      await revokeFamily(
        current.familyId,
        current.sessionId,
      );

      throw new AppError(
        401,
        "Refresh token reuse detected",
      );
    }

    throw error;
  }

  const accessToken =
    signAccessToken({
      userId:
        current.session.userId,

      sessionId:
        current.sessionId,

      applicationId:
        current.session.applicationId,
    });

  return {
    accessToken,
    refreshToken: nextRawToken,
  };
}

export async function revokeSessionByRefreshToken(
  rawRefreshToken: string,
): Promise<void> {
  const tokenHash =
    hashOpaqueToken(rawRefreshToken);

  const refresh =
    await prisma.refreshToken.findUnique({
      where: {
        tokenHash,
      },
    });

  if (!refresh) {
    return;
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.session.updateMany({
      where: {
        id: refresh.sessionId,
        revokedAt: null,
      },

      data: {
        revokedAt: now,
        revokeReason:
          "USER_LOGOUT",
      },
    }),

    prisma.refreshToken.updateMany({
      where: {
        sessionId:
          refresh.sessionId,

        revokedAt: null,
      },

      data: {
        revokedAt: now,
      },
    }),
  ]);
}