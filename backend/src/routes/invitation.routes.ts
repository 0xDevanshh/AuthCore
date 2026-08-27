import { Router } from "express";

import {
  listInvitationsController,
  revokeInvitationController,
  sendInvitationController,
} from "../controllers/invitation.controller.ts";

import { asyncHandler } from "../utils/async-handler.ts";

import { requirePermission } from "../middleware/requirePermission.middleware.ts";

import { PERMISSIONS } from "../constants/permissions.ts";

// mergeParams keeps :id from the parent /applications/:id mount visible.
export const invitationRouter = Router({
  mergeParams: true,
});

invitationRouter.post(
  "/",

  requirePermission(
    PERMISSIONS.MEMBER_INVITE,
  ),

  asyncHandler(sendInvitationController),
);

invitationRouter.get(
  "/",

  requirePermission(
    PERMISSIONS.MEMBER_INVITE,
  ),

  asyncHandler(listInvitationsController),
);

invitationRouter.delete(
  "/:invitationId",

  requirePermission(
    PERMISSIONS.MEMBER_INVITE,
  ),

  asyncHandler(revokeInvitationController),
);
