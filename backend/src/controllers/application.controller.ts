import type { Request, Response } from "express";

import {
  applicationIdParamSchema,
  createApplicationSchema,
} from "../validators/application.validator.ts";

import {
  createApplication,
  getApplicationForUser,
  listApplicationsForUser,
} from "../services/application.service.ts";

import { AppError } from "../utils/app-error.ts";

function authContext(req: Request) {
  if (!req.auth) {
    throw new AppError(401, "Authentication required");
  }

  return req.auth;
}

export async function createApplicationController(
  req: Request,
  res: Response,
) {
  const auth = authContext(req);

  const input = createApplicationSchema.parse(req.body);

  const application = await createApplication({
    name: input.name,
    ownerId: auth.userId,

    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  });

  res.status(201).json({
    success: true,

    message: "Application created successfully",

    data: { application },
  });
}

export async function listApplicationsController(
  req: Request,
  res: Response,
) {
  const auth = authContext(req);

  const applications = await listApplicationsForUser(auth.userId);

  res.status(200).json({
    success: true,

    data: { applications },
  });
}

export async function getApplicationController(
  req: Request,
  res: Response,
) {
  const auth = authContext(req);

  const params = applicationIdParamSchema.parse(req.params);

  const application = await getApplicationForUser(
    params.id,
    auth.userId,
  );

  res.status(200).json({
    success: true,

    data: { application },
  });
}
