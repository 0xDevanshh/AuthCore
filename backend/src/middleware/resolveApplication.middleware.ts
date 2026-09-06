import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";

import { prisma } from "../config/prisma.ts";

import { AppError } from "../utils/app-error.ts";

import { verifyApiKey } from "../services/application.service.ts";

export const API_KEY_HEADER = "X-AuthCore-Key";

/*
 * ============================================================================
 * THE BOOTSTRAP APPLICATION
 * ============================================================================
 *
 * These /auth/* routes serve two genuinely different callers, and until now
 * both were forced through the same gate:
 *
 *   1. A downstream customer's OWN backend, calling on behalf of ITS end
 *      users, holding THAT application's secret key. This is the case
 *      resolveApplication was built for, and it is unchanged below — a
 *      request that presents a key is validated exactly as before.
 *
 *   2. A developer signing up for or logging into AuthCore's own dashboard —
 *      the control plane itself. This caller has no application yet (that is
 *      the entire point of signing up), and never should need one: nobody
 *      hands out a secret key before a person has an account to hold it. A
 *      browser can't safely carry one anyway.
 *
 * Case 2 was previously indistinguishable from a caller who simply forgot
 * their key, and rejected the same way (API_KEY_MISSING) — which made the
 * dashboard's own signup/login permanently unreachable, since obtaining a key
 * requires a session, which requires logging in, which requires a key. See
 * the note on `resolveApplication` below for the fix.
 *
 * The bootstrap application is a single, fixed row (seeded once by
 * prisma/seed.ts, looked up here by a well-known slug) that exists purely to
 * satisfy `OneTimeToken.applicationId`, a required (non-null) foreign key —
 * email verification and password reset tokens cannot exist without SOME
 * application to point at. It is not created on demand here: if it is
 * missing, that means the seed has not been run, and this fails loudly
 * (500) rather than silently inventing infrastructure — including deciding
 * who owns it — as a side effect of a stranger's HTTP request.
 *
 * It carries no Role or Permission rows and nobody is ever added to it as a
 * Membership, so it never appears in anyone's Applications list and nothing
 * under /applications/:id/* is reachable for it — it is inert outside of
 * being an FK target and an audit-log/session scope for control-plane
 * activity.
 */
const BOOTSTRAP_APPLICATION_SLUG = "authcore-platform";

let cachedBootstrapApplicationId: string | null = null;

async function getBootstrapApplicationId(): Promise<string> {
  if (cachedBootstrapApplicationId) {
    return cachedBootstrapApplicationId;
  }

  const application = await prisma.application.findUnique({
    where: { slug: BOOTSTRAP_APPLICATION_SLUG },
    select: { id: true },
  });

  if (!application) {
    throw new AppError(
      500,
      "The platform is not fully set up yet. Run the seed script.",
      "BOOTSTRAP_APPLICATION_MISSING",
    );
  }

  // Cached as an id, not the row: ids don't change once assigned, so there is
  // nothing here that can go stale.
  cachedBootstrapApplicationId = application.id;

  return application.id;
}

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
  allowBootstrapFallback: boolean,
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
        if (allowBootstrapFallback) {
          // No key presented — this is a developer signing in to their own
          // AuthCore account, not a customer's backend acting for its end
          // users. See the note on BOOTSTRAP_APPLICATION_SLUG above.
          req.applicationId = await getBootstrapApplicationId();
          next();
          return;
        }

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
 * Resolves the calling application from the X-AuthCore-Key header, falling
 * back to the bootstrap application when no key is presented at all.
 *
 * A request WITH a key is validated exactly as before — end-user auth called
 * server-to-server or by the SDK, on behalf of a downstream customer's own
 * application, is unaffected by the fallback and still fails closed on an
 * invalid or revoked key. Only the "no key at all" case changed: that used to
 * mean "rejected", and now means "this is AuthCore's own control-plane
 * caller" — see the note on BOOTSTRAP_APPLICATION_SLUG above for why that is
 * the correct read of a missing key on these specific routes.
 */
export const resolveApplication =
  createResolver(false, true);

/**
 * Same key resolution as `resolveApplication`, but also accepts the key as a
 * `?key=` query parameter — required for OAuth start, a top-level browser
 * navigation where the browser issues the request itself and cannot attach a
 * custom header. See the note in auth.routes.ts.
 *
 * Deliberately NOT given the bootstrap fallback: dashboard-side "Sign in with
 * Google/GitHub" does not exist yet, so there is no verified control-plane
 * caller of this resolver to extend it to, and doing so sight-unseen for a
 * flow nothing has exercised would be guessing.
 */
export const resolveApplicationFromRedirect =
  createResolver(true, false);

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
