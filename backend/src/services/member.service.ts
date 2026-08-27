import {
  AuditActorType,
  MemberStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "../config/prisma.ts";

import { AppError } from "../utils/app-error.ts";

import { ROLE_NAMES } from "../constants/roles.ts";

import { logAuditEvent } from "./audit.service.ts";

interface ActorMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface MemberSummary {
  membershipId: string;
  userId: string;
  status: MemberStatus;
  roles: string[];
  joinedAt: Date;
}

const LAST_OWNER_MESSAGE =
  "Cannot remove the last owner of an application";

/**
 * Membership mutations run Serializable.
 *
 * The last-owner guard is a read (count owners) followed by a write, so at
 * Read Committed two concurrent requests could each observe two owners and
 * both proceed, leaving the application with none. Serializable makes the
 * loser fail rather than allowing that interleaving.
 */
const SERIALIZABLE = {
  isolationLevel:
    Prisma.TransactionIsolationLevel.Serializable,
} as const;

export async function listMembers(
  applicationId: string,
): Promise<MemberSummary[]> {
  const memberships = await prisma.membership.findMany({
    where: { applicationId },

    select: {
      id: true,
      userId: true,
      status: true,
      createdAt: true,

      roles: {
        select: {
          role: {
            select: { name: true },
          },
        },
      },
    },

    orderBy: { createdAt: "asc" },
  });

  return memberships.map((membership) => ({
    membershipId: membership.id,
    userId: membership.userId,
    status: membership.status,

    roles: membership.roles
      .map((entry) => entry.role.name)
      .sort(),

    joinedAt: membership.createdAt,
  }));
}

/**
 * Loads the application's Owner role id, or throws if the application has
 * no Owner role at all (only possible for rows seeded before the role
 * seeding existed).
 */
async function getOwnerRoleId(
  tx: Prisma.TransactionClient,
  applicationId: string,
): Promise<string> {
  const ownerRole = await tx.role.findUnique({
    where: {
      applicationId_name: {
        applicationId,
        name: ROLE_NAMES.OWNER,
      },
    },

    select: { id: true },
  });

  if (!ownerRole) {
    throw new AppError(
      500,
      "Application is missing its Owner role",
    );
  }

  return ownerRole.id;
}

/**
 * True when the membership holds the Owner role and no other active
 * membership does.
 *
 * Applies regardless of who is acting: a user demoting or removing
 * themselves hits exactly the same check.
 */
async function isLastOwner(
  tx: Prisma.TransactionClient,
  applicationId: string,
  membershipId: string,
  ownerRoleId: string,
): Promise<boolean> {
  const holdsOwner = await tx.membershipRole.findUnique({
    where: {
      membershipId_roleId: {
        membershipId,
        roleId: ownerRoleId,
      },
    },

    select: { roleId: true },
  });

  if (!holdsOwner) {
    return false;
  }

  const ownerCount = await tx.membership.count({
    where: {
      applicationId,
      status: MemberStatus.ACTIVE,

      roles: {
        some: { roleId: ownerRoleId },
      },
    },
  });

  return ownerCount <= 1;
}

async function loadMembership(
  tx: Prisma.TransactionClient,
  applicationId: string,
  membershipId: string,
) {
  const membership = await tx.membership.findFirst({
    where: {
      id: membershipId,
      applicationId,
    },

    select: {
      id: true,
      userId: true,

      roles: {
        select: {
          role: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  if (!membership) {
    throw new AppError(
      404,
      "Membership not found in this application",
    );
  }

  return membership;
}

/**
 * Replaces a membership's role assignment.
 *
 * The request body carries a single roleId, so this sets the membership's
 * roles to exactly that one — the schema's MembershipRole join allows
 * several, but there is no multi-role assignment API yet.
 */
export async function updateMembershipRole(
  applicationId: string,
  membershipId: string,
  roleId: string,
  requestedBy: string,
  metadata: ActorMetadata = {},
): Promise<MemberSummary> {
  return prisma.$transaction(async (tx) => {
    const membership = await loadMembership(
      tx,
      applicationId,
      membershipId,
    );

    // A role from another application must never be assignable.
    const targetRole = await tx.role.findFirst({
      where: {
        id: roleId,
        applicationId,
      },

      select: { id: true, name: true },
    });

    if (!targetRole) {
      throw new AppError(
        400,
        "Role does not belong to this application",
        "ROLE_APPLICATION_MISMATCH",
      );
    }

    const ownerRoleId = await getOwnerRoleId(
      tx,
      applicationId,
    );

    const previousRoles = membership.roles
      .map((entry) => entry.role.name)
      .sort();

    // Demoting the final Owner would leave the application ownerless.
    // Reassigning the last Owner *to* Owner is a no-op and stays allowed.
    if (
      targetRole.id !== ownerRoleId &&
      (await isLastOwner(
        tx,
        applicationId,
        membershipId,
        ownerRoleId,
      ))
    ) {
      throw new AppError(
        400,
        LAST_OWNER_MESSAGE,
        "LAST_OWNER",
      );
    }

    await tx.membershipRole.deleteMany({
      where: { membershipId },
    });

    await tx.membershipRole.create({
      data: {
        membershipId,
        roleId: targetRole.id,
      },
    });

    const updated = await tx.membership.update({
      where: { id: membershipId },

      data: { updatedAt: new Date() },

      select: {
        id: true,
        userId: true,
        status: true,
        createdAt: true,
      },
    });

    await logAuditEvent({
      tx,

      action: "MEMBER_ROLE_UPDATED",
      actorType: AuditActorType.USER,

      applicationId,
      userId: requestedBy,

      resourceType: "Membership",
      resourceId: membershipId,

      ipAddress: metadata.ipAddress ?? null,
      userAgent: metadata.userAgent ?? null,

      metadata: {
        targetUserId: membership.userId,
        previousRoles,
        newRole: targetRole.name,
        selfAction: membership.userId === requestedBy,
      },
    });

    return {
      membershipId: updated.id,
      userId: updated.userId,
      status: updated.status,
      roles: [targetRole.name],
      joinedAt: updated.createdAt,
    };
  }, SERIALIZABLE);
}

export async function removeMembership(
  applicationId: string,
  membershipId: string,
  requestedBy: string,
  metadata: ActorMetadata = {},
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const membership = await loadMembership(
      tx,
      applicationId,
      membershipId,
    );

    const ownerRoleId = await getOwnerRoleId(
      tx,
      applicationId,
    );

    if (
      await isLastOwner(
        tx,
        applicationId,
        membershipId,
        ownerRoleId,
      )
    ) {
      throw new AppError(
        400,
        LAST_OWNER_MESSAGE,
        "LAST_OWNER",
      );
    }

    const removedRoles = membership.roles
      .map((entry) => entry.role.name)
      .sort();

    // MembershipRole rows cascade on membership delete.
    await tx.membership.delete({
      where: { id: membershipId },
    });

    await logAuditEvent({
      tx,

      action: "MEMBER_REMOVED",
      actorType: AuditActorType.USER,

      applicationId,
      userId: requestedBy,

      resourceType: "Membership",
      resourceId: membershipId,

      ipAddress: metadata.ipAddress ?? null,
      userAgent: metadata.userAgent ?? null,

      metadata: {
        targetUserId: membership.userId,
        removedRoles,
        selfAction: membership.userId === requestedBy,
      },
    });
  }, SERIALIZABLE);
}
