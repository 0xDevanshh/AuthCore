import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { env } from "../config/env.ts";

import { AppError } from "../utils/app-error.ts";

const allowedOrigin =
  new URL(
    env.FRONTEND_URL,
  ).origin;

export function verifyRequestOrigin(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const origin =
    req.get("origin");

  // curl, Postman, server-to-server
  // requests may not send Origin.
  if (!origin) {
    return next();
  }

  if (origin !== allowedOrigin) {
    return next(
      new AppError(
        403,
        "Request origin is not allowed",
      ),
    );
  }

  next();
}