import { Router } from "express";

import {
  createApiKeyController,
  listApiKeysController,
  revokeApiKeyController,
} from "../controllers/api-key.controller.ts";

import { asyncHandler } from "../utils/async-handler.ts";

// mergeParams keeps :id from the parent /applications/:id mount visible.
export const apiKeyRouter = Router({
  mergeParams: true,
});

apiKeyRouter.post(
  "/",

  asyncHandler(createApiKeyController),
);

apiKeyRouter.get(
  "/",

  asyncHandler(listApiKeysController),
);

apiKeyRouter.delete(
  "/:keyId",

  asyncHandler(revokeApiKeyController),
);
