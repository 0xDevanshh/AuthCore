import { Router } from "express";

import {
  createApplicationController,
  getApplicationController,
  listApplicationsController,
} from "../controllers/application.controller.ts";

import { asyncHandler } from "../utils/async-handler.ts";

import { requireAuth } from "../middleware/auth.middleware.ts";

import { verifyRequestOrigin } from "../middleware/origin.middleware.ts";

import { apiKeyRouter } from "./api-key.routes.ts";

export const applicationRouter = Router();

// Control plane: every route here is the developer's dashboard session,
// never an API key. Applied at router level so a new route cannot be added
// unauthenticated by accident; the origin check runs first so a rejected
// request never costs the session lookup.
applicationRouter.use(verifyRequestOrigin);
applicationRouter.use(requireAuth);

applicationRouter.post(
  "/",

  asyncHandler(createApplicationController),
);

applicationRouter.get(
  "/",

  asyncHandler(listApplicationsController),
);

applicationRouter.get(
  "/:id",

  asyncHandler(getApplicationController),
);

// Inherits requireAuth + verifyRequestOrigin from this router.
applicationRouter.use(
  "/:id/keys",
  apiKeyRouter,
);
