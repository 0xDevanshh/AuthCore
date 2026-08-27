import {
  ApplicationStatus,
  AuditActorType,
  MemberStatus,
  Prisma,
  type Application,
} from "@prisma/client";

import { prisma } from "../config/prisma.ts";

import { AppError } from "../utils/app-error.ts";

import {
  randomSlugSuffix,
  slugify,
} from "../utils/slug.ts";

import { logAuditEvent } from "./audit.service.ts";

interface CreateApplicationParams {
  name: string;
  ownerId: string;

  // Optional actor context, recorded on the audit entry.
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Roles seeded with every new application. Permissions are attached in the
 * RBAC phase — these are name-only placeholders flagged as system roles so
 * later role editing can refuse to delete them.
 */
const DEFAULT_ROLES = [
  {
    name: "Owner",
    description: "Full control over the application, including deletion.",
  },
  {
    name: "Admin",
    description: "Manage members, roles, and application settings.",
  },
  {
    name: "Member",
    description: "Standard access to the application.",
  },
] as const;

const OWNER_ROLE_NAME = DEFAULT_ROLES[0].name;

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

    const ownerRole = await tx.role.findUniqueOrThrow({
      where: {
        applicationId_name: {
          applicationId: application.id,
          name: OWNER_ROLE_NAME,
        },
      },
      select: { id: true },
    });

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
        roleId: ownerRole.id,
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
