import { Router } from "express";

import {
  listAuditLogsController,
} from "../controllers/audit.controller.ts";

import { asyncHandler } from "../utils/async-handler.ts";

import { requirePermission } from "../middleware/requirePermission.middleware.ts";

import { PERMISSIONS } from "../constants/permissions.ts";

// mergeParams keeps :id from the parent /applications/:id mount visible,
// which is what requirePermission reads the application id from.
export const auditRouter = Router({
  mergeParams: true,
});

// Read-only. There is deliberately no write route: entries are produced by
// `logAuditEvent` as a side effect of the actions they describe, and an
// endpoint that let a caller author their own audit history would defeat the
// point of keeping one.
auditRouter.get(
  "/",

  requirePermission(
    PERMISSIONS.AUDIT_LOG_VIEW,
  ),

  asyncHandler(listAuditLogsController),
);
