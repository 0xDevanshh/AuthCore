import type { Request, Response } from "express";

import {
  applicationIdParamSchema,
  listAuditLogsQuerySchema,
} from "../validators/application.validator.ts";

import {
  listAuditLogs,
} from "../services/audit.service.ts";

/**
 * Lists an application's audit trail, newest first.
 *
 * The permission is enforced upstream by requirePermission(AUDIT_LOG_VIEW),
 * which already verified params.id names a real, accessible application —
 * the same trust every other controller behind this middleware extends it
 * (see member.controller.ts). This used to re-verify via
 * getApplicationForUser, a second existence check plus membership re-check
 * repeating what the middleware just did; trusting params.id here removes
 * that extra round trip. req.auth is not read at all — nothing in this
 * handler needs the caller's own id, only the application's.
 */
export async function listAuditLogsController(
  req: Request,
  res: Response,
) {
  const params = applicationIdParamSchema.parse(
    req.params,
  );

  const query = listAuditLogsQuerySchema.parse(
    req.query,
  );

  const result = await listAuditLogs({
    applicationId: params.id,

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
