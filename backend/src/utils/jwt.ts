import jwt, {
  type JwtPayload,
} from "jsonwebtoken";

import { env } from "../config/env.js";
import { AppError } from "./app-error.js";

interface AccessTokenInput {
  userId: string;
  sessionId: string;
  applicationId?: string | null;
}

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
  applicationId: string | null;
}

export function signAccessToken(
  input: AccessTokenInput,
): string {
  return jwt.sign(
    {
      sid: input.sessionId,
      appId: input.applicationId ?? null,
    },
    env.JWT_ACCESS_SECRET,
    {
      algorithm: "HS256",

      subject: input.userId,

      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,

      expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    },
  );
}

export function verifyAccessToken(
  token: string,
): AccessTokenClaims {
  try {
    const payload = jwt.verify(
      token,
      env.JWT_ACCESS_SECRET,
      {
        algorithms: ["HS256"],
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
      },
    ) as JwtPayload;

    if (
      !payload.sub ||
      typeof payload.sid !== "string"
    ) {
      throw new AppError(
        401,
        "Invalid authentication token",
      );
    }

    return {
      userId: payload.sub,
      sessionId: payload.sid,
      applicationId:
        typeof payload.appId === "string"
          ? payload.appId
          : null,
    };
  } catch {
    throw new AppError(
      401,
      "Invalid or expired authentication token",
    );
  }
}