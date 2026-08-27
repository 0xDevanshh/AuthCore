import {
  Router,
} from "express";

import { prisma } from "../config/prisma.ts";

import {
  authRouter,
} from "./auth.routes.ts";

import {
  applicationRouter,
} from "./application.routes.ts";

import {
  invitationAcceptRouter,
} from "./invitation-accept.routes.ts";

import {
  asyncHandler,
} from "../utils/async-handler.ts";

export const router =
  Router();

router.get(
  "/health",

  asyncHandler(
    async (_req, res) => {
      await prisma.$queryRaw`
        SELECT 1
      `;

      res.status(200).json({
        success: true,

        message:
          "AuthCore API is running",

        database:
          "connected",
      });
    },
  ),
);

router.use(
  "/auth",
  authRouter,
);

router.use(
  "/applications",
  applicationRouter,
);

router.use(
  "/invitations",
  invitationAcceptRouter,
);