import { Router } from "express";

import {
  createApiKeyController,
  listApiKeysController,
  revokeApiKeyController,
} from "../controllers/api-key.controller.ts";

import { asyncHandler } from "../utils/async-handler.ts";

import { requirePermission } from "../middleware/requirePermission.middleware.ts";

import { PERMISSIONS } from "../constants/permissions.ts";

// mergeParams keeps :id from the parent /applications/:id mount visible,
// which is what requirePermission reads the application id from.
export const apiKeyRouter = Router({
  mergeParams: true,
});

apiKeyRouter.post(
  "/",

  requirePermission(
    PERMISSIONS.APIKEY_CREATE,
  ),

  asyncHandler(createApiKeyController),
);

apiKeyRouter.get(
  "/",

  requirePermission(
    PERMISSIONS.APIKEY_LIST,
  ),

  asyncHandler(listApiKeysController),
);

apiKeyRouter.delete(
  "/:keyId",

  requirePermission(
    PERMISSIONS.APIKEY_REVOKE,
  ),

  asyncHandler(revokeApiKeyController),
);
