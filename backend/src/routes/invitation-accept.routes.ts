import { Router } from "express";

import { acceptInvitationController } from "../controllers/invitation.controller.ts";

import { asyncHandler } from "../utils/async-handler.ts";

import { requireAuth } from "../middleware/auth.middleware.ts";

import { verifyRequestOrigin } from "../middleware/origin.middleware.ts";

/**
 * Not mounted under /applications/:id — the token identifies the
 * application, and the invitee is by definition not yet a member, so no
 * requirePermission check applies here.
 */
export const invitationAcceptRouter = Router();

invitationAcceptRouter.post(
  "/accept",

  verifyRequestOrigin,
  requireAuth,

  asyncHandler(acceptInvitationController),
);
