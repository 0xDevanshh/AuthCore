import { Router } from "express";

import {
  listMembersController,
  removeMemberController,
  updateMemberRoleController,
} from "../controllers/member.controller.ts";

import { asyncHandler } from "../utils/async-handler.ts";

import { requirePermission } from "../middleware/requirePermission.middleware.ts";

import { PERMISSIONS } from "../constants/permissions.ts";

// mergeParams keeps :id from the parent /applications/:id mount visible,
// which is what requirePermission reads the application id from.
export const memberRouter = Router({
  mergeParams: true,
});

memberRouter.get(
  "/",

  requirePermission(
    PERMISSIONS.MEMBER_LIST,
  ),

  asyncHandler(listMembersController),
);

memberRouter.patch(
  "/:membershipId/role",

  requirePermission(
    PERMISSIONS.MEMBER_ROLE_UPDATE,
  ),

  asyncHandler(updateMemberRoleController),
);

memberRouter.delete(
  "/:membershipId",

  requirePermission(
    PERMISSIONS.MEMBER_REMOVE,
  ),

  asyncHandler(removeMemberController),
);
