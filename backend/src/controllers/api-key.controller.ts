import type { ApiKey } from "@prisma/client";
import type { Request, Response } from "express";

import {
  apiKeyIdParamSchema,
  applicationIdParamSchema,
  createApiKeySchema,
} from "../validators/application.validator.ts";

import {
  createApiKey,
  getApplicationForUser,
  listApiKeys,
  revokeApiKey,
} from "../services/application.service.ts";

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

/**
 * Dashboard-safe view of a key. Deliberately omits `keyHash`; the raw key is
 * never in the database to begin with.
 */
function serializeApiKey(apiKey: ApiKey) {
  return {
    id: apiKey.id,
    name: apiKey.name,
    prefix: apiKey.prefix,
    createdAt: apiKey.createdAt,
    revokedAt: apiKey.revokedAt,
  };
}

export async function createApiKeyController(
  req: Request,
  res: Response,
) {
  const auth = authContext(req);

  const params = applicationIdParamSchema.parse(req.params);
  const input = createApiKeySchema.parse(req.body ?? {});

  // Authorization: any active member may mint a key for now.
  // TODO(rbac): restrict to the Owner and Admin roles once role checks land.
  const application = await getApplicationForUser(
    params.id,
    auth.userId,
  );

  const metadata = requestMetadata(req);

  const result = await createApiKey(
    application.id,
    auth.userId,
    {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.expiresAt !== undefined
        ? { expiresAt: input.expiresAt }
        : {}),

      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    },
  );

  res.status(201).json({
    success: true,

    message:
      "API key created. Copy it now — it cannot be retrieved again.",

    data: {
      apiKey: serializeApiKey(result.apiKey),

      // The only time the raw secret is ever available.
      rawKey: result.rawKey,
    },
  });
}

export async function listApiKeysController(
  req: Request,
  res: Response,
) {
  const auth = authContext(req);

  const params = applicationIdParamSchema.parse(req.params);

  // TODO(rbac): restrict to the Owner and Admin roles once role checks land.
  const application = await getApplicationForUser(
    params.id,
    auth.userId,
  );

  const apiKeys = await listApiKeys(application.id);

  res.status(200).json({
    success: true,

    data: {
      apiKeys: apiKeys.map(serializeApiKey),
    },
  });
}

export async function revokeApiKeyController(
  req: Request,
  res: Response,
) {
  const auth = authContext(req);

  const params = apiKeyIdParamSchema.parse(req.params);

  // TODO(rbac): restrict to the Owner and Admin roles once role checks land.
  const application = await getApplicationForUser(
    params.id,
    auth.userId,
  );

  const revoked = await revokeApiKey(
    application.id,
    params.keyId,
    auth.userId,
    requestMetadata(req),
  );

  res.status(200).json({
    success: true,

    message: "API key revoked",

    data: {
      apiKey: serializeApiKey(revoked),
    },
  });
}
