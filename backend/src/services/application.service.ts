import { timingSafeEqual } from "node:crypto";

import {
  ApiKeyType,
  ApplicationStatus,
  AuditActorType,
  MemberStatus,
  Prisma,
  type ApiKey,
  type Application,
} from "@prisma/client";

import { prisma } from "../config/prisma.ts";

import { AppError } from "../utils/app-error.ts";

import {
  randomSlugSuffix,
  slugify,
} from "../utils/slug.ts";

import {
  API_KEY_LABEL,
  apiKeyPrefixOf,
  generateApiKey,
  hashOpaqueToken,
} from "../utils/token.ts";

import {
  ADMIN_PERMISSIONS,
  ALL_PERMISSIONS,
  MEMBER_PERMISSIONS,
  OWNER_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  type PermissionKey,
} from "../constants/permissions.ts";

import { logAuditEvent } from "./audit.service.ts";

interface CreateApplicationParams {
  name: string;
  ownerId: string;

  // Optional actor context, recorded on the audit entry.
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Roles seeded with every new application, and the permissions each one
 * receives. Flagged as system roles so later role editing can refuse to
 * delete them.
 */
const DEFAULT_ROLES: readonly {
  name: string;
  description: string;
  permissions: readonly PermissionKey[];
}[] = [
  {
    name: "Owner",
    description: "Full control over the application, including deletion.",
    permissions: OWNER_PERMISSIONS,
  },
  {
    name: "Admin",
    description: "Manage members, roles, and application settings.",
    permissions: ADMIN_PERMISSIONS,
  },
  {
    name: "Member",
    description: "Standard access to the application.",
    permissions: MEMBER_PERMISSIONS,
  },
];

const OWNER_ROLE_NAME = "Owner";

const SLUG_FALLBACK = "app";

const MAX_SLUG_ATTEMPTS = 5;

/**
 * Picks a slug that is free at the time of checking. The unique constraint
 * remains the real guard — see the P2002 retry in createApplication.
 */
async function generateUniqueSlug(
  name: string,
): Promise<string> {
  const base = slugify(name) || SLUG_FALLBACK;

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidate =
      attempt === 0 ? base : `${base}-${randomSlugSuffix()}`;

    const taken = await prisma.application.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!taken) {
      return candidate;
    }
  }

  return `${base}-${randomSlugSuffix()}-${randomSlugSuffix()}`;
}

async function createApplicationOnce(
  params: CreateApplicationParams,
  slug: string,
): Promise<Application> {
  return prisma.$transaction(async (tx) => {
    const application = await tx.application.create({
      data: {
        name: params.name,
        slug,
        ownerId: params.ownerId,
      },
    });

    await tx.role.createMany({
      data: DEFAULT_ROLES.map((role) => ({
        applicationId: application.id,
        name: role.name,
        description: role.description,
        isSystem: true,
      })),
    });

    // Permission rows are per-application (@@unique([applicationId, key])),
    // so each application gets its own copy of the catalog.
    await tx.permission.createMany({
      data: ALL_PERMISSIONS.map((key) => ({
        applicationId: application.id,
        key,
        description: PERMISSION_DESCRIPTIONS[key],
      })),
    });

    // createMany does not return rows; read the ids back to build the joins.
    const [roles, permissions] = [
      await tx.role.findMany({
        where: { applicationId: application.id },
        select: { id: true, name: true },
      }),

      await tx.permission.findMany({
        where: { applicationId: application.id },
        select: { id: true, key: true },
      }),
    ];

    const roleIdByName = new Map(
      roles.map((role) => [role.name, role.id]),
    );

    const permissionIdByKey = new Map(
      permissions.map((permission) => [
        permission.key,
        permission.id,
      ]),
    );

    const rolePermissions = DEFAULT_ROLES.flatMap((role) => {
      const roleId = roleIdByName.get(role.name);

      if (!roleId) {
        throw new Error(
          `Seeded role "${role.name}" was not found after creation`,
        );
      }

      return role.permissions.map((key) => {
        const permissionId = permissionIdByKey.get(key);

        if (!permissionId) {
          throw new Error(
            `Seeded permission "${key}" was not found after creation`,
          );
        }

        return { roleId, permissionId };
      });
    });

    await tx.rolePermission.createMany({
      data: rolePermissions,
    });

    const ownerRoleId = roleIdByName.get(OWNER_ROLE_NAME);

    if (!ownerRoleId) {
      throw new Error(
        "Owner role was not found after creation",
      );
    }

    const membership = await tx.membership.create({
      data: {
        applicationId: application.id,
        userId: params.ownerId,
        status: MemberStatus.ACTIVE,
      },
    });

    await tx.membershipRole.create({
      data: {
        membershipId: membership.id,
        roleId: ownerRoleId,
      },
    });

    // Written inside the transaction: the entry references the new
    // application by foreign key, so it must roll back with it.
    await logAuditEvent({
      tx,

      action: "APPLICATION_CREATED",
      actorType: AuditActorType.USER,

      applicationId: application.id,
      userId: params.ownerId,

      resourceType: "Application",
      resourceId: application.id,

      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,

      metadata: {
        name: application.name,
        slug: application.slug,
      },
    });

    return application;
  });
}

export async function createApplication(
  params: CreateApplicationParams,
): Promise<Application> {
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = await generateUniqueSlug(params.name);

    try {
      return await createApplicationOnce(params, slug);
    } catch (error) {
      const slugCollision =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        (error.meta?.["target"] as string[] | undefined)?.includes(
          "slug",
        ) === true;

      if (!slugCollision) {
        throw error;
      }
    }
  }

  throw new AppError(
    409,
    "Could not allocate a unique application slug. Try a different name.",
    "SLUG_ALLOCATION_FAILED",
  );
}

export async function listApplicationsForUser(
  userId: string,
): Promise<Application[]> {
  return prisma.application.findMany({
    where: {
      status: { not: ApplicationStatus.DELETED },

      memberships: {
        some: {
          userId,
          status: MemberStatus.ACTIVE,
        },
      },
    },

    orderBy: { createdAt: "desc" },
  });
}

/**
 * Loads one application on behalf of a user.
 *
 * 404 is reserved for ids that do not exist; a real application the caller
 * is not a member of is a 403.
 */
export async function getApplicationForUser(
  applicationId: string,
  userId: string,
): Promise<Application> {
  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      status: { not: ApplicationStatus.DELETED },
    },
  });

  if (!application) {
    throw new AppError(404, "Application not found");
  }

  const membership = await prisma.membership.findUnique({
    where: {
      applicationId_userId: {
        applicationId: application.id,
        userId,
      },
    },
    select: { status: true },
  });

  if (
    !membership ||
    membership.status !== MemberStatus.ACTIVE
  ) {
    throw new AppError(
      403,
      "You do not have access to this application",
      "APPLICATION_ACCESS_DENIED",
    );
  }

  return application;
}

interface CreateApiKeyOptions {
  name?: string;
  expiresAt?: Date | null;

  ipAddress?: string | null;
  userAgent?: string | null;
}

const DEFAULT_API_KEY_NAME = "Secret key";

/**
 * Mints a secret API key for an application.
 *
 * The raw key exists only in this function's return value. Callers get one
 * chance to show it to the user; nothing can recover it afterwards, because
 * only its HMAC and prefix are persisted.
 */
export async function createApiKey(
  applicationId: string,
  requestedBy: string,
  options: CreateApiKeyOptions = {},
): Promise<{ apiKey: ApiKey; rawKey: string }> {
  const generated = generateApiKey();

  const apiKey = await prisma.$transaction(async (tx) => {
    const created = await tx.apiKey.create({
      data: {
        applicationId,
        createdById: requestedBy,

        name: options.name ?? DEFAULT_API_KEY_NAME,
        type: ApiKeyType.SECRET,

        prefix: generated.prefix,
        keyHash: generated.hashedKey,

        scopes: [],

        expiresAt: options.expiresAt ?? null,
      },
    });

    await logAuditEvent({
      tx,

      action: "APPLICATION_KEY_CREATED",
      actorType: AuditActorType.USER,

      applicationId,
      userId: requestedBy,
      apiKeyId: created.id,

      resourceType: "ApiKey",
      resourceId: created.id,

      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,

      metadata: {
        name: created.name,
        prefix: created.prefix,
      },
    });

    return created;
  });

  return {
    apiKey,
    rawKey: generated.rawKey,
  };
}

/**
 * Resolves a raw API key to its application.
 *
 * Looked up by the indexed plaintext `prefix` rather than by hash — the
 * schema puts no unique constraint on `keyHash`, so a hash lookup would be
 * a sequential scan. Candidates sharing a prefix are then compared in
 * constant time.
 */
export async function verifyApiKey(
  rawKey: string,
): Promise<{ applicationId: string } | null> {
  const candidateKey = rawKey.trim();

  if (!candidateKey.startsWith(API_KEY_LABEL)) {
    return null;
  }

  const expectedHash = Buffer.from(
    hashOpaqueToken(candidateKey),
    "hex",
  );

  const candidates = await prisma.apiKey.findMany({
    where: {
      prefix: apiKeyPrefixOf(candidateKey),
      type: ApiKeyType.SECRET,

      revokedAt: null,

      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],

      application: {
        status: { not: ApplicationStatus.DELETED },
      },
    },

    select: {
      applicationId: true,
      keyHash: true,
    },
  });

  for (const candidate of candidates) {
    if (!candidate.keyHash) {
      continue;
    }

    const storedHash = Buffer.from(
      candidate.keyHash,
      "hex",
    );

    if (storedHash.length !== expectedHash.length) {
      continue;
    }

    if (timingSafeEqual(storedHash, expectedHash)) {
      return {
        applicationId: candidate.applicationId,
      };
    }
  }

  return null;
}

export async function listApiKeys(
  applicationId: string,
): Promise<ApiKey[]> {
  return prisma.apiKey.findMany({
    where: { applicationId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Revokes a key by stamping `revokedAt`. The row is kept so audit entries
 * referencing it stay resolvable.
 *
 * Idempotent: revoking an already-revoked key returns it unchanged rather
 * than moving the original revocation timestamp.
 */
export async function revokeApiKey(
  applicationId: string,
  keyId: string,
  requestedBy: string,
  metadata: {
    ipAddress?: string | null;
    userAgent?: string | null;
  } = {},
): Promise<ApiKey> {
  const existing = await prisma.apiKey.findFirst({
    where: {
      id: keyId,
      applicationId,
    },
  });

  if (!existing) {
    throw new AppError(404, "API key not found");
  }

  if (existing.revokedAt) {
    return existing;
  }

  return prisma.$transaction(async (tx) => {
    const revoked = await tx.apiKey.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    await logAuditEvent({
      tx,

      action: "APPLICATION_KEY_REVOKED",
      actorType: AuditActorType.USER,

      applicationId,
      userId: requestedBy,
      apiKeyId: revoked.id,

      resourceType: "ApiKey",
      resourceId: revoked.id,

      ipAddress: metadata.ipAddress ?? null,
      userAgent: metadata.userAgent ?? null,

      metadata: {
        name: revoked.name,
        prefix: revoked.prefix,
      },
    });

    return revoked;
  });
}
