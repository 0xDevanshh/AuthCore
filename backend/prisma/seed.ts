/**
 * Bootstraps a local environment so the dashboard can actually be logged
 * into: the "AuthCore Platform" bootstrap application (see the note in
 * resolveApplication.middleware.ts — it exists purely to satisfy
 * OneTimeToken's required applicationId FK for control-plane signup/password
 * flows, has no Role/Permission rows, and nothing is ever a Member of it), and
 * one verified developer account to log in with.
 *
 * Idempotent: safe to run again against a database that already has either
 * row. User identity has no unique column of its own (see the note in
 * auth.service.ts — it's global, keyed through UserEmail), so the user lookup
 * goes through the email relation rather than a plain upsert.
 *
 * Run with: npx tsx prisma/seed.ts (or `npm run seed`)
 */
import { prisma } from "../src/config/prisma.ts";
import { hashPassword } from "../src/utils/password.ts";

const BOOTSTRAP_APPLICATION_SLUG = "authcore-platform";
const BOOTSTRAP_APPLICATION_NAME = "AuthCore Platform";

const SEED_EMAIL = "sharmadevansh563@gmail.com";
const SEED_PASSWORD = "123456789";

/*
 * Deliberately NOT run through `passwordSchema` (upper+lower+digit+special,
 * 8-128 chars) — this password fails that policy, and a seed script writes
 * directly to the database rather than calling the signup endpoint, so
 * nothing enforces it here. That's fine for a policy that only ever
 * re-validates a password being SET, never one already on file (see the
 * comment on changePasswordSchema.currentPassword) — but it does mean this is
 * a weak, seed-only credential. Change it after logging in once, or edit
 * SEED_PASSWORD above before running this against anything but a local
 * database.
 */

async function upsertSeedUser(): Promise<string> {
  const normalizedEmail = SEED_EMAIL.trim().toLowerCase();
  const passwordHash = await hashPassword(SEED_PASSWORD);

  const existingEmail = await prisma.userEmail.findUnique({
    where: { normalized: normalizedEmail },
    select: { userId: true, verifiedAt: true },
  });

  if (existingEmail) {
    await prisma.user.update({
      where: { id: existingEmail.userId },
      data: { passwordHash },
    });

    // In case an earlier real signup attempt left this address unverified —
    // a seed account should never sit behind an email-verification link.
    if (!existingEmail.verifiedAt) {
      await prisma.userEmail.update({
        where: { normalized: normalizedEmail },
        data: { verifiedAt: new Date() },
      });
    }

    return existingEmail.userId;
  }

  const created = await prisma.user.create({
    data: {
      passwordHash,

      emails: {
        create: {
          email: normalizedEmail,
          normalized: normalizedEmail,
          isPrimary: true,
          verifiedAt: new Date(),
        },
      },
    },

    select: { id: true },
  });

  return created.id;
}

async function main() {
  const userId = await upsertSeedUser();

  console.log(
    `User ready: ${SEED_EMAIL} / ${SEED_PASSWORD} (id ${userId})`,
  );

  const bootstrapApplication = await prisma.application.upsert({
    where: { slug: BOOTSTRAP_APPLICATION_SLUG },

    update: {},

    create: {
      name: BOOTSTRAP_APPLICATION_NAME,
      slug: BOOTSTRAP_APPLICATION_SLUG,
      ownerId: userId,
    },

    select: { id: true, slug: true },
  });

  console.log(
    `Bootstrap application ready: ${bootstrapApplication.slug} (id ${bootstrapApplication.id})`,
  );
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
