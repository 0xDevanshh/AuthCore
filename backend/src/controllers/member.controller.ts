import type { Request, Response } from "express";

import {
  applicationIdParamSchema,
  membershipIdParamSchema,
  updateMemberRoleSchema,
} from "../validators/application.validator.ts";

import {
  listMembers,
  removeMembership,
  updateMembershipRole,
} from "../services/member.service.ts";

import { AppError } from "../utils/app-error.ts";

function authContext(req: Request) {
  if (!req.auth) {
    throw new AppError(401, "Authentication required");
  }

  return req.auth;
}

function requestMetadata(req: Request) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  };
}

export async function listMembersController(
  req: Request,
  res: Response,
) {
  const params = applicationIdParamSchema.parse(req.params);

  const members = await listMembers(params.id);

  res.status(200).json({
    success: true,

    data: { members },
  });
}

export async function updateMemberRoleController(
  req: Request,
  res: Response,
) {
  const auth = authContext(req);

  const params = membershipIdParamSchema.parse(req.params);
  const input = updateMemberRoleSchema.parse(req.body);

  const member = await updateMembershipRole(
    params.id,
    params.membershipId,
    input.roleId,
    auth.userId,
    requestMetadata(req),
  );

  res.status(200).json({
    success: true,

    message: "Member role updated",

    data: { member },
  });
}

export async function removeMemberController(
  req: Request,
  res: Response,
) {
  const auth = authContext(req);

  const params = membershipIdParamSchema.parse(req.params);

  await removeMembership(
    params.id,
    params.membershipId,
    auth.userId,
    requestMetadata(req),
  );

  res.status(200).json({
    success: true,

    message: "Member removed from application",
  });
}
