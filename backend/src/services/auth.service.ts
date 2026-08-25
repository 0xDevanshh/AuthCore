import {
  Prisma,
} from "@prisma/client";

import { prisma } from "../config/prisma.ts";

import {
  hashPassword,
  verifyPassword,
} from "../utils/password.ts";

import { AppError } from "../utils/app-error.ts";

import {
  createSession,
} from "./session.service.ts";

import type {
  LoginInput,
  SignupInput,
} from "../validators/auth.validator.ts";

interface SessionMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function getSafeUser(
  userId: string,
) {
  const user =
    await prisma.user.findUnique({
      where: {
        id: userId,
      },

      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        avatarUrl: true,
        createdAt: true,
        disabledAt: true,

        emails: {
          where: {
            isPrimary: true,
          },

          select: {
            email: true,
            verifiedAt: true,
          },

          take: 1,
        },
      },
    });

  if (!user) {
    throw new AppError(
      404,
      "User not found",
    );
  }

  const primaryEmail =
    user.emails[0] ?? null;

  return {
    id: user.id,

    firstName: user.firstName,
    lastName: user.lastName,

    username: user.username,

    avatarUrl: user.avatarUrl,

    email:
      primaryEmail?.email ??
      null,

    emailVerified:
      Boolean(
        primaryEmail?.verifiedAt,
      ),

    createdAt: user.createdAt,
  };
}

export async function signup(
  input: SignupInput,
) {
  const normalizedEmail =
    input.email
      .trim()
      .toLowerCase();

  const existingEmail =
    await prisma.userEmail.findUnique({
      where: {
        normalized:
          normalizedEmail,
      },

      select: {
        id: true,
      },
    });

  if (existingEmail) {
    throw new AppError(
      409,
      "An account with this email already exists",
      "EMAIL_ALREADY_EXISTS",
    );
  }

  const passwordHash =
    await hashPassword(
      input.password,
    );

  try {
    const user =
      await prisma.$transaction(
        async (tx) => {
          const createdUser =
            await tx.user.create({
              data: {
                firstName:
                  input.firstName ?? null,

                lastName:
                  input.lastName ?? null,

                passwordHash,
              },
            });

          await tx.userEmail.create({
            data: {
              userId:
                createdUser.id,

              email:
                normalizedEmail,

              normalized:
                normalizedEmail,

              isPrimary: true,

              verifiedAt: null,
            },
          });

          return createdUser;
        },
      );

    return getSafeUser(user.id);
  } catch (error) {
    if (
      error instanceof
      Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AppError(
        409,
        "An account with this email already exists",
        "EMAIL_ALREADY_EXISTS",
      );
    }

    throw error;
  }
}

export async function login(
  input: LoginInput,
  metadata: SessionMetadata,
) {
  const normalizedEmail =
    input.email
      .trim()
      .toLowerCase();

  const emailRecord =
    await prisma.userEmail.findUnique({
      where: {
        normalized:
          normalizedEmail,
      },

      include: {
        user: true,
      },
    });

  // Same response whether email exists or not.
  if (
    !emailRecord ||
    !emailRecord.user.passwordHash
  ) {
    throw new AppError(
      401,
      "Invalid email or password",
      "INVALID_CREDENTIALS",
    );
  }

  const passwordValid =
    await verifyPassword(
      emailRecord.user.passwordHash,
      input.password,
    );

  if (!passwordValid) {
    throw new AppError(
      401,
      "Invalid email or password",
      "INVALID_CREDENTIALS",
    );
  }

  if (
    emailRecord.user.disabledAt
  ) {
    throw new AppError(
      403,
      "Account is disabled",
      "ACCOUNT_DISABLED",
    );
  }

  const tokens =
    await createSession(
      emailRecord.user.id,
      metadata,
    );

  const user =
    await getSafeUser(
      emailRecord.user.id,
    );

  return {
    user,
    tokens,
  };
}