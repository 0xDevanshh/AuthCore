import {
  AuditActorType,
  MemberStatus,
  Prisma,
  type Invitation,
} from "@prisma/client";

import { prisma } from "../config/prisma.ts";
import { env } from "../config/env.ts";

import { AppError } from "../utils/app-error.ts";

import { generateOneTimeToken } from "../utils/token.ts";

import {
  buildInvitationAcceptUrl,
  sendInvitationEmail,
} from "../utils/email.ts";

import { logAuditEvent } from "./audit.service.ts";

/**
 * SCHEMA NOTE — invitations do NOT use OneTimeToken, and cannot.
 *
 * The relationship is unambiguous once read closely: `Invitation` holds its
 * own `tokenHash String @unique` plus `expiresAt`, `acceptedAt` and
 * `revokedAt`. It has no relation to `OneTimeToken`. The Invitation row IS
 * the token record.
 *
 * Using OneTimeToken here is also impossible without a schema change, on
 * two counts:
 *   1. `TokenPurpose` has exactly four members — EMAIL_VERIFICATION,
 *      PASSWORD_RESET, EMAIL_CHANGE, MFA_CHALLENGE. There is no
 *      INVITATION member to tag a row with.
 *   2. `OneTimeToken.userId` is a required FK to User. An invitee who has
 *      not signed up yet has no User row, so the token could not be
 *      created at all.
 *
 * Collision with future email-verification and password-reset tokens is
 * therefore structural rather than tag-based: those live in OneTimeToken,
 * invitations live in Invitation, and the two tables never overlap.
 *
 * LIMITATION — `roleId` and `invitedBy` are NOT persisted.
 *
 * `Invitation` has no column for either one. Both are validated here and
 * recorded in the INVITATION_SENT audit entry's metadata, but they are not
 * queryable invitation state. The accept flow cannot recover the intended
 * role from the Invitation row; granting a role on accept needs
 * `roleId` and `invitedBy` columns added to the model first.
 */

interface SendInvitationParams {
  applicationId: string;
  invitedEmail: string;
  roleId: string;
  invitedBy: string;

  ipAddress?: string | null;
  userAgent?: string | null;
}

const SERIALIZABLE = {
  isolationLevel:
    Prisma.TransactionIsolationLevel.Serializable,
} as const;

function invitationExpiry(): Date {
  return new Date(
    Date.now() +
      env.INVITATION_TTL_SECONDS * 1000,
  );
}

export async function sendInvitation(
  params: SendInvitationParams,
): Promise<{
  invitation: Invitation;
  rawToken: string;
}> {
  const normalizedEmail = params.invitedEmail
    .trim()
    .toLowerCase();

  const token = generateOneTimeToken();

  const now = new Date();

  // Serializable: each guard below is a read followed by an insert, and
  // email+applicationId carries no unique constraint, so concurrent
  // requests could otherwise both pass and create duplicates.
  const { invitation, applicationName } =
    await prisma.$transaction(async (tx) => {
      const application =
        await tx.application.findUnique({
          where: { id: params.applicationId },
          select: { id: true, name: true },
        });

      if (!application) {
        throw new AppError(
          404,
          "Application not found",
        );
      }

      // A role from another application must never be assignable.
      const role = await tx.role.findFirst({
        where: {
          id: params.roleId,
          applicationId: params.applicationId,
        },

        select: { id: true, name: true },
      });

      if (!role) {
        throw new AppError(
          400,
          "Role does not belong to this application",
          "ROLE_APPLICATION_MISMATCH",
        );
      }

      // Already a member? Identity is global (see the note in
      // auth.service.ts), so resolve the email to a user first.
      const existingEmail =
        await tx.userEmail.findUnique({
          where: { normalized: normalizedEmail },
          select: { userId: true },
        });

      if (existingEmail) {
        const membership =
          await tx.membership.findUnique({
            where: {
              applicationId_userId: {
                applicationId:
                  params.applicationId,
                userId: existingEmail.userId,
              },
            },

            select: { status: true },
          });

        if (
          membership &&
          membership.status === MemberStatus.ACTIVE
        ) {
          throw new AppError(
            400,
            "User is already a member",
            "ALREADY_A_MEMBER",
          );
        }
      }

      const pending =
        await tx.invitation.findFirst({
          where: {
            applicationId: params.applicationId,
            email: normalizedEmail,

            acceptedAt: null,
            revokedAt: null,

            expiresAt: { gt: now },
          },

          select: { id: true, expiresAt: true },
        });

      if (pending) {
        throw new AppError(
          409,
          "An invitation for this email is already pending",
          "INVITATION_ALREADY_PENDING",
        );
      }

      const created = await tx.invitation.create({
        data: {
          applicationId: params.applicationId,
          email: normalizedEmail,

          tokenHash: token.hashedToken,

          expiresAt: invitationExpiry(),
        },
      });

      await logAuditEvent({
        tx,

        action: "INVITATION_SENT",
        actorType: AuditActorType.USER,

        applicationId: params.applicationId,
        userId: params.invitedBy,

        resourceType: "Invitation",
        resourceId: created.id,

        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,

        // roleId/roleName and invitedBy live here because the Invitation
        // model has no columns for them. See the note at the top.
        metadata: {
          email: normalizedEmail,
          roleId: role.id,
          roleName: role.name,
          invitedBy: params.invitedBy,
          expiresAt:
            created.expiresAt.toISOString(),
        },
      });

      return {
        invitation: created,
        applicationName: application.name,
      };
    }, SERIALIZABLE);

  sendInvitationEmail({
    to: normalizedEmail,
    applicationName,

    acceptUrl: buildInvitationAcceptUrl(
      token.rawToken,
    ),
  });

  return {
    invitation,
    rawToken: token.rawToken,
  };
}
