import {
  AuditActorType,
  MfaType,
} from "@prisma/client";

import * as OTPAuth from "otpauth";

import QRCode from "qrcode";

import { prisma } from "../config/prisma.ts";

import { AppError } from "../utils/app-error.ts";

import { logAuditEvent } from "./audit.service.ts";

/**
 * SCHEMA NOTES — read before extending this file.
 *
 * `MfaMethod` carries `type` (the `MfaType` enum: TOTP, EMAIL_OTP,
 * SMS_OTP, WEBAUTHN), `secretEnc String?`, `credential Json?` (for
 * WebAuthn, unused here), `enabled Boolean @default(false)`, `verifiedAt
 * DateTime?`, `lastUsedAt`, and `label String?`.
 *
 * There is NO `verified` boolean. Enrollment state is the pair
 * (`verifiedAt`, `enabled`): both null/false while a secret is pending
 * confirmation, both set once the user proves possession in 7.2. Treat
 * `verifiedAt: { not: null }` as the definition of "this method is real".
 *
 * `@@unique` is absent on ([userId, type]) — a user can hold several TOTP
 * rows, which is why enrollment cleans up its own pending rows below
 * rather than relying on an upsert.
 */

/**
 * A TOTP secret is NOT hashed, unlike a password or a one-time token. It
 * is a shared symmetric secret: the server must recompute codes from it on
 * every verification, so a one-way function is not an option.
 *
 * SECURITY DEBT — this writes the secret in PLAINTEXT into a column named
 * `secretEnc`, which is actively misleading to anyone who reads the schema
 * and assumes the name means what it says. Nothing in this codebase
 * encrypts anything at rest today: `OAuthAccount.accessTokenEnc`,
 * `refreshTokenEnc` and `OAuthProviderConfig.clientSecretEnc` are the same
 * situation, and oauth.service.ts currently writes literal nulls into
 * them.
 *
 * What that costs: anyone with read access to the database — a backup, a
 * replica, a dumped table, a SQL-injection read — holds every user's
 * second factor outright, and can generate valid codes indefinitely. A
 * leaked password hash still has to be cracked; a leaked TOTP secret does
 * not.
 *
 * The fix is small and self-contained: AES-256-GCM via node:crypto behind
 * an `encryptSecret`/`decryptSecret` pair, keyed by a new env secret in
 * the shape of the existing TOKEN_HASH_SECRET, applied to all four columns
 * at once. Left out here deliberately rather than done in passing, because
 * it is a cross-cutting change (it needs a key-rotation story and a
 * backfill for existing rows) and it belongs to all of those columns, not
 * just this one.
 */
const TOTP_SECRET_IS_PLAINTEXT = true;

// RFC 4226 recommends at least 128 bits and 160 for the HMAC-SHA1
// construction TOTP uses; 20 bytes is what authenticator apps expect and
// what otpauth's own default produces.
const TOTP_SECRET_BYTES = 20;

const TOTP_DIGITS = 6;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_ALGORITHM = "SHA1";

const DEFAULT_ISSUER = "AuthCore";

export interface TotpEnrollment {
  secret: string;
  qrCodeDataUrl: string;
}

/**
 * Resolves the label an authenticator app shows for this account.
 *
 * `Application.name` when the session belongs to one, so a user enrolled
 * in several applications does not end up with a column of identical
 * "AuthCore" entries. Falls back to the product name for sessions with no
 * application, and if the row has vanished.
 */
async function resolveIssuer(
  applicationId: string | null,
): Promise<string> {
  if (!applicationId) {
    return DEFAULT_ISSUER;
  }

  const application =
    await prisma.application.findUnique({
      where: { id: applicationId },
      select: { name: true },
    });

  return (
    application?.name?.trim() ||
    DEFAULT_ISSUER
  );
}

/**
 * Begins TOTP enrollment: mints a secret, stores it unverified, and
 * returns what the user needs to add it to an authenticator app.
 *
 * The method is NOT active on return. `verifiedAt` stays null and
 * `enabled` stays false until 7.2's confirmation step proves the user
 * actually holds the secret. Nothing in the login flow consults this yet.
 *
 * Returns the raw secret alongside the QR code so a user whose device
 * cannot scan — or who is enrolling on the same device showing the page —
 * can type it in. This is the one and only time the secret is handed
 * back; there is no endpoint to re-read it, and 7.2 should not add one.
 */
export async function enrollTotp(
  userId: string,
  options: {
    applicationId?: string | null;

    ipAddress?: string | null;
    userAgent?: string | null;
  } = {},
): Promise<TotpEnrollment> {
  const user = await prisma.user.findUnique({
    where: { id: userId },

    select: {
      id: true,
      disabledAt: true,

      emails: {
        where: { isPrimary: true },
        select: { email: true },
        take: 1,
      },
    },
  });

  if (!user || user.disabledAt) {
    throw new AppError(
      401,
      "Authentication required",
      "INVALID_CREDENTIALS",
    );
  }

  // Guards against silently replacing a working second factor. Removing
  // an active method is its own operation — it needs its own proof of
  // possession — and is deliberately not smuggled into enrollment.
  const existingVerified =
    await prisma.mfaMethod.findFirst({
      where: {
        userId,
        type: MfaType.TOTP,
        verifiedAt: { not: null },
      },

      select: { id: true },
    });

  if (existingVerified) {
    throw new AppError(
      400,
      "An authenticator app is already set up for this account. Remove it before enrolling a new one.",
      "MFA_TOTP_ALREADY_ENROLLED",
    );
  }

  const issuer = await resolveIssuer(
    options.applicationId ?? null,
  );

  const accountLabel =
    user.emails[0]?.email ?? userId;

  const secret = new OTPAuth.Secret({
    size: TOTP_SECRET_BYTES,
  });

  const totp = new OTPAuth.TOTP({
    issuer,
    label: accountLabel,

    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,

    secret,
  });

  const otpauthUri = totp.toString();

  // Generated before the write so a QR failure does not leave an orphaned
  // pending secret behind.
  const qrCodeDataUrl =
    await QRCode.toDataURL(otpauthUri);

  await prisma.$transaction(
    async (tx) => {
      // Abandoned enrollments are replaced, not accumulated: a user who
      // opens the setup page three times should not leave three live
      // secrets, any of which would confirm. Only unverified TOTP rows
      // are touched — the guard above has already ruled out a verified
      // one existing.
      await tx.mfaMethod.deleteMany({
        where: {
          userId,
          type: MfaType.TOTP,
          verifiedAt: null,
        },
      });

      const created = await tx.mfaMethod.create({
        data: {
          userId,

          type: MfaType.TOTP,

          // Plaintext despite the column name — see the note above.
          secretEnc: secret.base32,

          // Both stay off until 7.2 confirms possession.
          enabled: false,
          verifiedAt: null,
        },
      });

      await logAuditEvent({
        tx,

        action: "MFA_ENROLLMENT_STARTED",
        actorType: AuditActorType.USER,

        applicationId:
          options.applicationId ?? null,

        userId,

        resourceType: "MfaMethod",
        resourceId: created.id,

        ipAddress: options.ipAddress ?? null,
        userAgent: options.userAgent ?? null,

        // No secret, no otpauth URI, no QR payload — the URI embeds the
        // secret, so logging it would put the second factor in the audit
        // trail.
        metadata: {
          type: MfaType.TOTP,
          issuer,
          secretEncrypted:
            !TOTP_SECRET_IS_PLAINTEXT,
        },
      });

    },
  );

  return {
    secret: secret.base32,
    qrCodeDataUrl,
  };
}
