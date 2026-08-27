import { AuditActorType, MemberStatus, ApplicationStatus } from "@prisma/client";

import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";

import { prisma } from "../config/prisma.ts";

import { AppError } from "../utils/app-error.ts";

import { logAuditEvent } from "../services/audit.service.ts";

import { getRolePermissions } from "../services/rbac.service.ts";

/**
 * Application id param. Matches the existing control-plane convention —
 * /applications/:id, with the nested key router using mergeParams so :id
 * stays visible there.
 */
const APPLICATION_ID_PARAM = "id";

/**
 * Records a denial without holding up the response.
 *
 * logAuditEvent already swallows its own errors when no transaction is
 * passed, so this cannot produce an unhandled rejection.
 */
function recordDenial(
  req: Request,
  applicationId: string,
  userId: string,
  permission: string,
  reason: "NOT_A_MEMBER" | "MISSING_PERMISSION",
): void {
  void logAuditEvent({
    action: "PERMISSION_DENIED",
    actorType: AuditActorType.USER,

    applicationId,
    userId,

    resourceType: "Application",
    resourceId: applicationId,

    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,

    metadata: {
      permission,
      applicationId,
      reason,
    },
  });
}

/**
 * Gates a control-plane route on a permission granted through the caller's
 * Membership roles.
 *
 * Expects requireAuth to have populated req.auth (this codebase names it
 * req.auth, not req.user) and the route to carry an :id param naming the
 * application.
 *
 * On success the resolved membership — including the union of permissions
 * across all its roles — is attached to req.membership.
 */
export function requirePermission(
  permission: string,
): RequestHandler {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.auth) {
        throw new AppError(
          401,
          "Authentication required",
        );
      }

      const userId = req.auth.userId;

      // Express 5 types params as string | string[]; only a single value
      // is meaningful here.
      const rawApplicationId =
        req.params[APPLICATION_ID_PARAM];

      const applicationId =
        typeof rawApplicationId === "string"
          ? rawApplicationId
          : null;

      if (!applicationId) {
        throw new AppError(
          400,
          "Application id is missing from the request",
        );
      }

      // Single query: existence check and the caller's membership with its
      // role ids. Existence is checked separately from membership so a
      // nonexistent application stays a 404, matching getApplicationForUser.
      const application =
        await prisma.application.findFirst({
          where: {
            id: applicationId,
            status: {
              not: ApplicationStatus.DELETED,
            },
          },

          select: {
            id: true,

            memberships: {
              where: { userId },

              select: {
                id: true,
                status: true,

                roles: {
                  select: { roleId: true },
                },
              },

              take: 1,
            },
          },
        });

      if (!application) {
        throw new AppError(
          404,
          "Application not found",
        );
      }

      const membership = application.memberships[0];

      // A suspended or merely invited member is treated as a non-member,
      // and told the same thing, so membership status is not disclosed.
      if (
        !membership ||
        membership.status !== MemberStatus.ACTIVE
      ) {
        recordDenial(
          req,
          application.id,
          userId,
          permission,
          "NOT_A_MEMBER",
        );

        throw new AppError(
          403,
          "Not a member of this application",
          "NOT_A_MEMBER",
        );
      }

      const roleIds = membership.roles.map(
        (role) => role.roleId,
      );

      // Membership.roles is a list, so a member may hold several roles.
      // Permissions are the union across all of them.
      const permissionSets = await Promise.all(
        roleIds.map((roleId) =>
          getRolePermissions(roleId),
        ),
      );

      const permissions = [
        ...new Set(permissionSets.flat()),
      ];

      if (!permissions.includes(permission)) {
        recordDenial(
          req,
          application.id,
          userId,
          permission,
          "MISSING_PERMISSION",
        );

        throw new AppError(
          403,
          `Missing required permission: ${permission}`,
          "MISSING_PERMISSION",
        );
      }

      req.membership = {
        id: membership.id,

        applicationId: application.id,

        userId,

        roleIds,

        permissions,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
