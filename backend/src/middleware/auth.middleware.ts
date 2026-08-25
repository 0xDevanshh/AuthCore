import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { prisma } from "../config/prisma.ts";

import { AppError } from "../utils/app-error.ts";

import {
  cookieNames,
} from "../utils/cookies.ts";

import {
  verifyAccessToken,
} from "../utils/jwt.ts";

function extractAccessToken(
  req: Request,
): string | null {
  const cookieToken =
    req.cookies?.[
      cookieNames.access
    ];

  if (
    typeof cookieToken ===
    "string"
  ) {
    return cookieToken;
  }

  const authorization =
    req.get("authorization");

  if (
    authorization?.startsWith(
      "Bearer ",
    )
  ) {
    return authorization.slice(7);
  }

  return null;
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const token =
      extractAccessToken(req);

    if (!token) {
      throw new AppError(
        401,
        "Authentication required",
      );
    }

    const claims =
      verifyAccessToken(token);

    const session =
      await prisma.session.findFirst({
        where: {
          id: claims.sessionId,

          userId:
            claims.userId,

          revokedAt: null,

          expiresAt: {
            gt: new Date(),
          },

          user: {
            disabledAt: null,
          },
        },

        select: {
          id: true,
          userId: true,
          applicationId: true,
        },
      });

    if (!session) {
      throw new AppError(
        401,
        "Session is no longer active",
      );
    }

    req.auth = {
      userId: session.userId,

      sessionId:
        session.id,

      applicationId:
        session.applicationId,
    };

    next();
  } catch (error) {
    next(error);
  }
}