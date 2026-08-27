import type { Request, Response } from "express";

import {
  applicationIdParamSchema,
  sendInvitationSchema,
} from "../validators/application.validator.ts";

import { sendInvitation } from "../services/invitation.service.ts";

import { AppError } from "../utils/app-error.ts";

function authContext(req: Request) {
  if (!req.auth) {
    throw new AppError(401, "Authentication required");
  }

  return req.auth;
}

export async function sendInvitationController(
  req: Request,
  res: Response,
) {
  const auth = authContext(req);

  const params = applicationIdParamSchema.parse(req.params);
  const input = sendInvitationSchema.parse(req.body);

  const result = await sendInvitation({
    applicationId: params.id,
    invitedEmail: input.email,
    roleId: input.roleId,
    invitedBy: auth.userId,

    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  });

  res.status(201).json({
    success: true,

    message: "Invitation sent",

    data: {
      invitation: {
        id: result.invitation.id,
        email: result.invitation.email,
        expiresAt: result.invitation.expiresAt,
        createdAt: result.invitation.createdAt,
      },
    },
  });
}
