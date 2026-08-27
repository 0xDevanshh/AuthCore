import {
  ApplicationStatus,
  AuditActorType,
  MemberStatus,
  Prisma,
  type Invitation,
  type Membership,
} from "@prisma/client";

import { prisma } from "../config/prisma.ts";
import { env } from "../config/env.ts";

import { AppError } from "../utils/app-error.ts";

import {
  generateOneTimeToken,
  hashOpaqueToken,
} from "../utils/token.ts";

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
 * `Invitation.roleId` and `Invitation.invitedBy` were added to the schema
 * so an accepted invitation can grant the role it was issued for. The
 * migration for those two columns is still outstanding — see the note in
 * acceptInvitation.
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

          roleId: role.id,
          invitedBy: params.invitedBy,

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

/**
 * Accepts an invitation on behalf of an authenticated user.
 *
 * TOKEN LOOKUP — there is no OneTimeToken row to find. Invitations carry
 * their own `tokenHash`, and `TokenPurpose` has no INVITATION member, so
 * "look up the OneTimeToken with purpose INVITATION" has no equivalent
 * here. `Invitation.acceptedAt` serves the role that `OneTimeToken.usedAt`
 * would have played: it is what marks the token spent.
 *
 * GAP — signup-then-accept is not handled.
 *
 * This requires the invitee to already hold an AuthCore account whose email
 * matches the invitation, because a Membership needs a userId. Someone
 * invited to an application who has never signed up has no account to
 * authenticate as, so the link lands them on a login screen with no path
 * forward. A "register through this invitation" flow — creating the user
 * and the membership in one transaction, with the invitation standing as
 * proof of email ownership — is separate work and is deliberately not
 * improvised here.
 *
 * GAP — the email match does not require a verified address.
 *
 * The invitee's UserEmail is matched on `normalized` regardless of
 * `verifiedAt`, because no email-verification flow exists yet, so every
 * address in the system is unverified and requiring verification would
 * reject every invitation. Until verification ships, someone who signs up
 * claiming an invited address can accept that invitation. Tightening this
 * to `verifiedAt: { not: null }` is a one-line change once Phase 5 lands.
 */
export async function acceptInvitation(
  rawToken: string,
  userId: string,
  metadata: {
    ipAddress?: string | null;
    userAgent?: string | null;
  } = {},
): Promise<Membership> {
  const tokenHash = hashOpaqueToken(
    rawToken.trim(),
  );

  return prisma.$transaction(async (tx) => {
    const invitation =
      await tx.invitation.findUnique({
        where: { tokenHash },

        select: {
          id: true,
          applicationId: true,
          email: true,
          roleId: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,

          application: {
            select: { id: true, status: true },
          },
        },
      });

    // Distinct messages per failure so the frontend can react precisely.
    if (!invitation) {
      throw new AppError(
        400,
        "Invitation not found",
        "INVITATION_NOT_FOUND",
      );
    }

    if (invitation.acceptedAt) {
      throw new AppError(
        400,
        "Invitation has already been accepted",
        "INVITATION_ALREADY_ACCEPTED",
      );
    }

    if (invitation.revokedAt) {
      throw new AppError(
        400,
        "Invitation has been revoked",
        "INVITATION_REVOKED",
      );
    }

    if (invitation.expiresAt <= new Date()) {
      throw new AppError(
        400,
        "Invitation has expired",
        "INVITATION_EXPIRED",
      );
    }

    if (
      invitation.application.status ===
      ApplicationStatus.DELETED
    ) {
      throw new AppError(
        400,
        "Application is no longer available",
        "APPLICATION_UNAVAILABLE",
      );
    }

    // An invitation is only acceptable by the person it was sent to. Any
    // of the user's addresses may match, not just the primary one.
    const matchingEmail =
      await tx.userEmail.findFirst({
        where: {
          userId,
          normalized: invitation.email,
        },

        select: { id: true },
      });

    if (!matchingEmail) {
      throw new AppError(
        400,
        "This invitation was sent to a different email address",
        "INVITATION_EMAIL_MISMATCH",
      );
    }

    const existingMembership =
      await tx.membership.findUnique({
        where: {
          applicationId_userId: {
            applicationId:
              invitation.applicationId,
            userId,
          },
        },

        select: { id: true },
      });

    if (existingMembership) {
      throw new AppError(
        400,
        "You are already a member of this application",
        "ALREADY_A_MEMBER",
      );
    }

    // The invited role could have been deleted between send and accept.
    const role = await tx.role.findFirst({
      where: {
        id: invitation.roleId,
        applicationId: invitation.applicationId,
      },

      select: { id: true, name: true },
    });

    if (!role) {
      throw new AppError(
        400,
        "The role this invitation was issued for no longer exists",
        "INVITED_ROLE_MISSING",
      );
    }

    const membership = await tx.membership.create({
      data: {
        applicationId: invitation.applicationId,
        userId,
        status: MemberStatus.ACTIVE,
      },
    });

    await tx.membershipRole.create({
      data: {
        membershipId: membership.id,
        roleId: role.id,
      },
    });

    // Invitation.acceptedAt is what marks this token spent; guarded on
    // acceptedAt: null so a concurrent accept cannot double-consume it.
    const consumed =
      await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
        },

        data: { acceptedAt: new Date() },
      });

    if (consumed.count !== 1) {
      throw new AppError(
        400,
        "Invitation has already been accepted",
        "INVITATION_ALREADY_ACCEPTED",
      );
    }

    await logAuditEvent({
      tx,

      action: "INVITATION_ACCEPTED",
      actorType: AuditActorType.USER,

      applicationId: invitation.applicationId,
      userId,

      resourceType: "Membership",
      resourceId: membership.id,

      ipAddress: metadata.ipAddress ?? null,
      userAgent: metadata.userAgent ?? null,

      metadata: {
        invitationId: invitation.id,
        email: invitation.email,
        roleId: role.id,
        roleName: role.name,
      },
    });

    return membership;
  }, SERIALIZABLE);
}
