import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";

import { AppError } from "../utils/app-error.ts";

import { verifyApiKey } from "../services/application.service.ts";

export const API_KEY_HEADER = "X-AuthCore-Key";

const API_KEY_QUERY_PARAM = "key";

function readApiKey(
  req: Request,
  allowQueryParam: boolean,
): string | null {
  const header = req.get(API_KEY_HEADER);

  if (
    typeof header === "string" &&
    header.trim().length > 0
  ) {
    return header.trim();
  }

  if (allowQueryParam) {
    const fromQuery =
      req.query[API_KEY_QUERY_PARAM];

    if (
      typeof fromQuery === "string" &&
      fromQuery.trim().length > 0
    ) {
      return fromQuery.trim();
    }
  }

  return null;
}

function createResolver(
  allowQueryParam: boolean,
): RequestHandler {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ) => {
    try {
      const rawKey = readApiKey(
        req,
        allowQueryParam,
      );

      if (!rawKey) {
        throw new AppError(
          401,
          "Missing API key",
          "API_KEY_MISSING",
        );
      }

      const resolved =
        await verifyApiKey(rawKey);

      if (!resolved) {
        throw new AppError(
          401,
          "Invalid or revoked API key",
          "API_KEY_INVALID",
        );
      }

      req.applicationId =
        resolved.applicationId;

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Resolves the calling application from the X-AuthCore-Key header.
 *
 * For end-user auth endpoints called server-to-server or by the SDK, where
 * a request header can always be set.
 */
export const resolveApplication =
  createResolver(false);

/**
 * Same, but also accepts the key as a `?key=` query parameter.
 *
 * Required for OAuth start, which is a top-level browser navigation — the
 * browser issues that request itself and cannot attach a custom header.
 * See the note in auth.routes.ts.
 */
export const resolveApplicationFromRedirect =
  createResolver(true);

/**
 * Narrows req.applicationId for handlers mounted behind one of the
 * resolvers above.
 */
export function requireApplicationId(
  req: Request,
): string {
  if (!req.applicationId) {
    throw new AppError(
      401,
      "Missing API key",
      "API_KEY_MISSING",
    );
  }

  return req.applicationId;
}
