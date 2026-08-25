import {
  OAuthProvider,
} from "@prisma/client";

import { prisma } from "../config/prisma.js";

import { AppError } from "../utils/app-error.js";

import {
  createSession,
} from "./session.service.js";

import {
  getSafeUser,
} from "./auth.service.js";

import type {
  OAuthIdentity,
} from "./oauth/google.oauth.js";

interface SessionMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
}

function providerEnum(
  provider:
    | "GOOGLE"
    | "GITHUB",
): OAuthProvider {
  return provider === "GOOGLE"
    ? OAuthProvider.GOOGLE
    : OAuthProvider.GITHUB;
}

export async function loginWithOAuth(
  identity: OAuthIdentity,
  metadata: SessionMetadata,
) {
  const provider =
    providerEnum(
      identity.provider,
    );

  const normalizedEmail =
    identity.email
      .trim()
      .toLowerCase();

  const userId =
    await prisma.$transaction(
      async (tx) => {
        const existingAccount =
          await tx.oAuthAccount.findUnique({
            where: {
              provider_providerAccountId:
                {
                  provider,

                  providerAccountId:
                    identity.providerAccountId,
                },
            },

            include: {
              user: true,
            },
          });

        if (existingAccount) {
          if (
            existingAccount.user
              .disabledAt
          ) {
            throw new AppError(
              403,
              "Account is disabled",
            );
          }

          await tx.oAuthAccount.update({
            where: {
              id: existingAccount.id,
            },

            data: {
              scopes:
                identity.scopes,
            },
          });

          return existingAccount.userId;
        }

        const existingEmail =
          await tx.userEmail.findUnique({
            where: {
              normalized:
                normalizedEmail,
            },

            include: {
              user: true,
            },
          });

        if (existingEmail) {
          if (
            existingEmail.user
              .disabledAt
          ) {
            throw new AppError(
              403,
              "Account is disabled",
            );
          }

          const providerAlreadyLinked =
            await tx.oAuthAccount.findUnique({
              where: {
                userId_provider: {
                  userId:
                    existingEmail.userId,

                  provider,
                },
              },
            });

          if (
            providerAlreadyLinked &&
            providerAlreadyLinked.providerAccountId !==
              identity.providerAccountId
          ) {
            throw new AppError(
              409,
              `${identity.provider} is already linked to another account`,
            );
          }

          if (
            !providerAlreadyLinked
          ) {
            await tx.oAuthAccount.create({
              data: {
                userId:
                  existingEmail.userId,

                provider,

                providerAccountId:
                  identity.providerAccountId,

                scopes:
                  identity.scopes,

                // Sign-in only:
                // provider tokens are not persisted.
                accessTokenEnc: null,
                refreshTokenEnc: null,
              },
            });
          }

          if (
            !existingEmail.verifiedAt
          ) {
            await tx.userEmail.update({
              where: {
                id: existingEmail.id,
              },

              data: {
                verifiedAt:
                  new Date(),
              },
            });
          }

          await tx.user.update({
            where: {
              id:
                existingEmail.userId,
            },

            data: {
              firstName:
                existingEmail.user
                  .firstName ??
                identity.firstName ??
                null,

              lastName:
                existingEmail.user
                  .lastName ??
                identity.lastName ??
                null,

              avatarUrl:
                existingEmail.user
                  .avatarUrl ??
                identity.avatarUrl ??
                null,
            },
          });

          return existingEmail.userId;
        }

        const newUser =
          await tx.user.create({
            data: {
              firstName:
                identity.firstName ??
                null,

              lastName:
                identity.lastName ??
                null,

              avatarUrl:
                identity.avatarUrl ??
                null,

              passwordHash: null,
            },
          });

        await tx.userEmail.create({
          data: {
            userId:
              newUser.id,

            email:
              normalizedEmail,

            normalized:
              normalizedEmail,

            isPrimary: true,

            // Google/GitHub already confirmed
            // ownership of this email.
            verifiedAt:
              new Date(),
          },
        });

        await tx.oAuthAccount.create({
          data: {
            userId:
              newUser.id,

            provider,

            providerAccountId:
              identity.providerAccountId,

            scopes:
              identity.scopes,

            accessTokenEnc: null,
            refreshTokenEnc: null,
          },
        });

        return newUser.id;
      },
    );

  const tokens =
    await createSession(
      userId,
      metadata,
    );

  const user =
    await getSafeUser(userId);

  return {
    user,
    tokens,
  };
}