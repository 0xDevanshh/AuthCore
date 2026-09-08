import type { ApiKey } from "@prisma/client";
import type { Request, Response } from "express";

import {
  apiKeyIdParamSchema,
  applicationIdParamSchema,
  createApiKeySchema,
} from "../validators/application.validator.ts";

import {
  createApiKey,
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

  // Permission enforced upstream by requirePermission(APIKEY_CREATE), which
  // already verified params.id names a real, accessible application — see
  // the identical pattern in member.controller.ts. The extra
  // getApplicationForUser call this used to make was a second full round
  // trip (an existence check plus a membership re-check) repeating work the
  // middleware just did; trusting params.id here is the same trust every
  // other controller behind this middleware already extends it.
  const metadata = requestMetadata(req);

  const result = await createApiKey(
    params.id,
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
  const params = applicationIdParamSchema.parse(req.params);

  // Permission enforced upstream by requirePermission(APIKEY_LIST), which
  // already verified params.id — see the note on createApiKeyController.
  const apiKeys = await listApiKeys(params.id);

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

  // Permission enforced upstream by requirePermission(APIKEY_REVOKE), which
  // already verified params.id — see the note on createApiKeyController.
  const revoked = await revokeApiKey(
    params.id,
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
