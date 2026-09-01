import type { Request, Response } from "express";

import {
  applicationIdParamSchema,
  listAuditLogsQuerySchema,
} from "../validators/application.validator.ts";

import {
  getApplicationForUser,
} from "../services/application.service.ts";

import {
  listAuditLogs,
} from "../services/audit.service.ts";

import { AppError } from "../utils/app-error.ts";

function authContext(req: Request) {
  if (!req.auth) {
    throw new AppError(
      401,
      "Authentication required",
    );
  }

  return req.auth;
}

/**
 * Lists an application's audit trail, newest first.
 *
 * The permission is enforced upstream by
 * requirePermission(AUDIT_LOG_VIEW). `getApplicationForUser` still runs, for
 * the same reason it does on the API key routes: it preserves the
 * 404-for-unknown-id behaviour and re-checks membership, so the handler is not
 * relying solely on the route being mounted with its middleware.
 */
export async function listAuditLogsController(
  req: Request,
  res: Response,
) {
  const auth = authContext(req);

  const params = applicationIdParamSchema.parse(
    req.params,
  );

  const query = listAuditLogsQuerySchema.parse(
    req.query,
  );

  const application =
    await getApplicationForUser(
      params.id,
      auth.userId,
    );

  const result = await listAuditLogs({
    applicationId: application.id,

    ...(query.cursor !== undefined
      ? { cursor: query.cursor }
      : {}),

    ...(query.action !== undefined
      ? { action: query.action }
      : {}),

    limit: query.limit,
  });

  // An audit trail is a record of who did what and when; a cached copy of it
  // is worse than useless.
  res.set("Cache-Control", "no-store");

  res.status(200).json({
    success: true,

    data: {
      // `metadata` on each entry is passed through exactly as stored — the
      // whole payload is the point of reading an audit log.
      logs: result.logs,

      nextCursor: result.nextCursor,
    },
  });
}
