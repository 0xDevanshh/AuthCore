import type { Request, Response } from "express";

import {
  applicationIdParamSchema,
  createApplicationSchema,
} from "../validators/application.validator.ts";

import {
  createApplication,
  getApplicationForUser,
  listApplicationsForUser,
} from "../services/application.service.ts";

import {
  findOwnMembership,
  getPermissionsForRoles,
} from "../services/rbac.service.ts";

import { AppError } from "../utils/app-error.ts";

function authContext(req: Request) {
  if (!req.auth) {
    throw new AppError(401, "Authentication required");
  }

  return req.auth;
}

export async function createApplicationController(
  req: Request,
  res: Response,
) {
  const auth = authContext(req);

  const input = createApplicationSchema.parse(req.body);

  const application = await createApplication({
    name: input.name,
    ownerId: auth.userId,

    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  });

  res.status(201).json({
    success: true,

    message: "Application created successfully",

    data: { application },
  });
}

export async function listApplicationsController(
  req: Request,
  res: Response,
) {
  const auth = authContext(req);

  const applications = await listApplicationsForUser(auth.userId);

  res.status(200).json({
    success: true,

    data: { applications },
  });
}

export async function getApplicationController(
  req: Request,
  res: Response,
) {
  const auth = authContext(req);

  const params = applicationIdParamSchema.parse(req.params);

  const application = await getApplicationForUser(
    params.id,
    auth.userId,
  );

  res.status(200).json({
    success: true,

    data: { application },
  });
}

/**
 * "What is my own standing in this application?" — role names for display,
 * plus the permission keys a client can use to decide what to show without
 * waiting for a 403.
 *
 * Exists specifically so a dashboard client (see the Application layout's
 * role/permission context on the frontend) does not have to infer this by
 * fetching the full member list and searching it for its own user id — a
 * heuristic that was both slower (an O(members) response for a single-row
 * answer) and imprecise (it could only distinguish Member from
 * Owner/Admin by whether member:list happened to succeed).
 *
 * Gated on requireAuth only, not requirePermission: unlike every other route
 * under /applications/:id/*, there is no single permission that makes sense
 * to require here — a Member with almost no permissions must still be able
 * to see that they hold none, or the endpoint would defeat its own purpose.
 * Membership itself, resolved via the same findOwnMembership query
 * requirePermission uses, is the only real gate: a non-member gets a 403 the
 * same way they would from any other application-scoped route.
 */
export async function getOwnMembershipController(
  req: Request,
  res: Response,
) {
  const auth = authContext(req);

  const params = applicationIdParamSchema.parse(req.params);

  const { applicationExists, membership } = await findOwnMembership(
    params.id,
    auth.userId,
  );

  if (!applicationExists) {
    throw new AppError(404, "Application not found");
  }

  // Same non-disclosure as requirePermission: a suspended or merely invited
  // membership is told the same thing as no membership at all.
  if (!membership) {
    throw new AppError(
      403,
      "You do not have access to this application",
      "APPLICATION_ACCESS_DENIED",
    );
  }

  const permissions = await getPermissionsForRoles(membership.roleIds);

  res.status(200).json({
    success: true,

    data: {
      roles: membership.roleNames,
      permissions,
    },
  });
}
