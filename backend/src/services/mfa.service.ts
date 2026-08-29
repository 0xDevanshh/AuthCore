import {
  AuditActorType,
  MfaType,
  Prisma,
  TokenPurpose,
} from "@prisma/client";

import { randomInt } from "node:crypto";

import * as OTPAuth from "otpauth";

import QRCode from "qrcode";

import { prisma } from "../config/prisma.ts";
import { env } from "../config/env.ts";
import { logger } from "../config/logger.ts";

import { AppError } from "../utils/app-error.ts";

import {
  generateOneTimeToken,
  hashOpaqueToken,
} from "../utils/token.ts";

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

/**
 * Codes accepted either side of the current 30-second step.
 *
 * `window: 1` means a submitted code validates against steps -1, 0 and +1
 * — a 90-second span. That covers the ordinary case this exists for: a
 * phone whose clock has drifted a few seconds, and a user who starts
 * typing at second 29. Widening it buys very little usability and
 * multiplies the number of codes valid at any instant, which is exactly
 * what a brute-force attempt is counting.
 */
const TOTP_VALIDATION_WINDOW = 1;

/**
 * Checks a submitted code against a stored base32 secret.
 *
 * Returns the step delta on a match — 0 for the current step, ±1 for
 * clock drift — and null otherwise. NOTE THAT 0 IS A MATCH: callers must
 * test `=== null`, never truthiness, or every correctly-timed code is
 * rejected.
 *
 * Shared by enrollment confirmation and login so the two can never drift
 * apart on window size or digit count — a login that accepted a wider
 * window than setup did would be a silent weakening.
 */
export function validateTotpCode(
  secretBase32: string,
  code: string,
): number | null {
  // Authenticator apps and users both like to add spaces; the digits are
  // what matter.
  const submittedCode = code
    .trim()
    .replace(/\s+/g, "");

  const totp = new OTPAuth.TOTP({
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,

    // Plaintext today — see the note at the top of this file.
    secret: OTPAuth.Secret.fromBase32(
      secretBase32,
    ),
  });

  return totp.validate({
    token: submittedCode,
    window: TOTP_VALIDATION_WINDOW,
  });
}

/**
 * The verified, enabled TOTP method for a user, or null.
 *
 * "Has MFA" means exactly this pair: `verifiedAt` set (possession was
 * proven) and `enabled` true. A row with a secret but no verifiedAt is an
 * abandoned enrollment and must never gate a login.
 */
export async function getActiveTotpMethod(
  userId: string,
): Promise<{
  id: string;
  secretEnc: string;
} | null> {
  const method =
    await prisma.mfaMethod.findFirst({
      where: {
        userId,
        type: MfaType.TOTP,

        verifiedAt: { not: null },
        enabled: true,
      },

      select: {
        id: true,
        secretEnc: true,
      },

      orderBy: { verifiedAt: "desc" },
    });

  if (!method?.secretEnc) {
    return null;
  }

  return {
    id: method.id,
    secretEnc: method.secretEnc,
  };
}

/**
 * Completes TOTP enrollment by proving the user holds the secret.
 *
 * This is the step that makes the method real: `verifiedAt` and `enabled`
 * are set together, and 7.3's login flow should treat that pair as the
 * signal that an account requires a second factor. Nothing consults it
 * yet.
 *
 * Rejections are deliberately uniform. A wrong code, a code from ten
 * minutes ago, and a code for a different account all return the same
 * "Invalid code" — distinguishing expired from wrong would tell an
 * attacker their clock arithmetic is right and only the secret is wrong,
 * which is the more useful half.
 */
export async function verifyTotpSetup(
  userId: string,
  code: string,
  options: {
    applicationId?: string | null;

    ipAddress?: string | null;
    userAgent?: string | null;
  } = {},
): Promise<{ recoveryCodes: string[] }> {
  // Authenticator apps and users both like to add spaces; the digits are
  // what matter.
  const submittedCode = code
    .trim()
    .replace(/\s+/g, "");

  const pending =
    await prisma.mfaMethod.findFirst({
      where: {
        userId,
        type: MfaType.TOTP,
        verifiedAt: null,
      },

      select: {
        id: true,
        secretEnc: true,
      },

      // enrollTotp clears stale pending rows, so there should only ever
      // be one. Newest wins if that invariant is ever broken.
      orderBy: { createdAt: "desc" },
    });

  if (!pending || !pending.secretEnc) {
    throw new AppError(
      400,
      "No pending MFA setup found",
      "MFA_NO_PENDING_SETUP",
    );
  }

  const delta = validateTotpCode(
    pending.secretEnc,
    submittedCode,
  );

  if (delta === null) {
    throw new AppError(
      400,
      "Invalid code",
      "MFA_INVALID_CODE",
    );
  }

  const now = new Date();

  // Generated inside the same transaction that enables MFA, so the two
  // commit or fail together. An account must never end up with a second
  // factor switched on and no recovery path — that is precisely how a
  // lost phone becomes a permanently locked account.
  const recoveryCodes =
    await prisma.$transaction(async (tx) => {
    // Guarded on verifiedAt: null, like every other one-shot transition
    // in this codebase — two concurrent confirmations must not both
    // count, and this is also what makes a second submission of the same
    // still-valid code fail rather than re-activate.
    const activated =
      await tx.mfaMethod.updateMany({
        where: {
          id: pending.id,
          verifiedAt: null,
        },

        data: {
          verifiedAt: now,
          enabled: true,
          lastUsedAt: now,
        },
      });

    if (activated.count !== 1) {
      throw new AppError(
        400,
        "No pending MFA setup found",
        "MFA_NO_PENDING_SETUP",
      );
    }

    await logAuditEvent({
      tx,

      action: "MFA_ENABLED",
      actorType: AuditActorType.USER,

      applicationId:
        options.applicationId ?? null,

      userId,

      resourceType: "MfaMethod",
      resourceId: pending.id,

      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,

      metadata: {
        type: MfaType.TOTP,

        // How far off the user's clock was. Useful for diagnosing a
        // support ticket about codes never working; carries nothing
        // secret.
        clockDriftSteps: delta,
      },
    });

    return generateRecoveryCodes(userId, {
      applicationId:
        options.applicationId ?? null,

      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,

      tx,
    });
  });

  // Shown once, by the caller, and never retrievable again — only HMACs
  // are stored.
  return { recoveryCodes };
}

/**
 * Challenge tokens reuse `OneTimeToken` rather than getting a table of
 * their own.
 *
 * The fit is exact, not forced: `TokenPurpose.MFA_CHALLENGE` already
 * exists in the enum, and the model carries every column this needs —
 * `tokenHash @unique` for the HMAC, `expiresAt`, `usedAt` for single-use
 * consumption, `userId` and `applicationId` FKs, and `attempts`, which is
 * what makes per-challenge throttling possible without a schema change.
 * A new table would duplicate all of it.
 *
 * (Contrast invitations, which genuinely could not use this model — see
 * the header note in invitation.service.ts.)
 */
const MFA_CHALLENGE_MAX_ATTEMPTS = 5;

function challengeExpiry(): Date {
  return new Date(
    Date.now() +
      env.MFA_CHALLENGE_TTL_SECONDS * 1000,
  );
}

export interface MfaChallenge {
  challengeToken: string;
  expiresAt: Date;
}

/**
 * Burns a challenge and records the success.
 *
 * Shared by both ways of passing the second factor — a TOTP code and a
 * recovery code — so neither can end up skipping the consumption guard
 * or the audit entry. `extra` carries whatever distinguishes the two in
 * the audit metadata.
 */
async function consumeChallenge(
  challengeId: string,
  applicationId: string,
  userId: string,
  mfaMethodId: string,
  metadata: {
    ipAddress?: string | null;
    userAgent?: string | null;
  },
  extra: Prisma.InputJsonObject,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Guarded on usedAt: null, so two concurrent submissions of the same
    // valid code cannot both open a session.
    const consumed =
      await tx.oneTimeToken.updateMany({
        where: {
          id: challengeId,
          usedAt: null,
        },

        data: { usedAt: new Date() },
      });

    if (consumed.count !== 1) {
      throw new AppError(
        401,
        "Invalid or expired MFA challenge. Please log in again.",
        "MFA_CHALLENGE_INVALID",
      );
    }

    await tx.mfaMethod.update({
      where: { id: mfaMethodId },
      data: { lastUsedAt: new Date() },
    });

    await logAuditEvent({
      tx,

      action: "MFA_CHALLENGE_SUCCESS",
      actorType: AuditActorType.USER,

      applicationId,
      userId,

      resourceType: "MfaMethod",
      resourceId: mfaMethodId,

      ipAddress: metadata.ipAddress ?? null,
      userAgent: metadata.userAgent ?? null,

      metadata: extra,
    });
  });
}

/**
 * Issues a challenge for a login that has passed the password check but
 * not yet the second factor.
 *
 * This token is NOT a session. It authenticates nothing: it identifies one
 * pending login, is good for a single successful code submission, and
 * expires in minutes. Nothing accepts it as a credential except
 * completeMfaLogin.
 *
 * Any older live challenge for the user is consumed first — the same
 * one-live-token rule email verification and password reset follow. A user
 * who retries login twice should not leave two challenges standing, either
 * of which would open a session.
 */
export async function issueMfaChallenge(
  userId: string,
  applicationId: string,
  metadata: {
    ipAddress?: string | null;
    userAgent?: string | null;
  } = {},
): Promise<MfaChallenge> {
  const token = generateOneTimeToken();

  const expiresAt = challengeExpiry();

  await prisma.$transaction(async (tx) => {
    const now = new Date();

    await tx.oneTimeToken.updateMany({
      where: {
        userId,
        purpose: TokenPurpose.MFA_CHALLENGE,

        usedAt: null,
        expiresAt: { gt: now },
      },

      data: { usedAt: now },
    });

    const created = await tx.oneTimeToken.create({
      data: {
        applicationId,
        userId,

        purpose: TokenPurpose.MFA_CHALLENGE,

        tokenHash: token.hashedToken,

        expiresAt,
      },
    });

    await logAuditEvent({
      tx,

      action: "MFA_CHALLENGE_ISSUED",
      actorType: AuditActorType.USER,

      applicationId,
      userId,

      resourceType: "OneTimeToken",
      resourceId: created.id,

      ipAddress: metadata.ipAddress ?? null,
      userAgent: metadata.userAgent ?? null,

      metadata: {
        expiresAt: expiresAt.toISOString(),
      },
    });
  });

  return {
    challengeToken: token.rawToken,
    expiresAt,
  };
}

/**
 * Completes a login by validating the second factor.
 *
 * Failure handling differs from the enrollment step on purpose. There, a
 * wrong code is a typo; here it is a login attempt against an account
 * whose password is already known to the caller, so every failure is
 * counted on the challenge row and the challenge is burned once
 * MFA_CHALLENGE_MAX_ATTEMPTS is reached. That per-challenge counter is
 * the real brute-force defence — the route's IP limiter is a backstop, and
 * an attacker with an IP pool walks around it.
 *
 * Five attempts against a 6-digit code with a +/-1 step window is roughly
 * a 1-in-70,000 chance per challenge, and a burned challenge costs a fresh
 * password login to replace.
 */
export async function completeMfaLogin(
  challengeToken: string,
  totpCode: string,
  applicationId: string,
  metadata: {
    ipAddress?: string | null;
    userAgent?: string | null;
  } = {},
): Promise<{ userId: string }> {
  const tokenHash = hashOpaqueToken(
    challengeToken.trim(),
  );

  const challenge =
    await prisma.oneTimeToken.findUnique({
      where: { tokenHash },

      select: {
        id: true,
        userId: true,
        purpose: true,
        usedAt: true,
        expiresAt: true,
        attempts: true,

        user: {
          select: { disabledAt: true },
        },
      },
    });

  // Every rejection below is 401 with the same code. The caller is
  // mid-login and unauthenticated; the only useful instruction is "start
  // again", and naming which of these went wrong would tell an attacker
  // holding a stolen challenge whether it is still live.
  if (
    !challenge ||
    challenge.purpose !==
      TokenPurpose.MFA_CHALLENGE ||
    challenge.usedAt ||
    challenge.expiresAt <= new Date() ||
    challenge.user.disabledAt ||
    challenge.attempts >=
      MFA_CHALLENGE_MAX_ATTEMPTS
  ) {
    throw new AppError(
      401,
      "Invalid or expired MFA challenge. Please log in again.",
      "MFA_CHALLENGE_INVALID",
    );
  }

  const method = await getActiveTotpMethod(
    challenge.userId,
  );

  // MFA was removed between issuing this challenge and answering it.
  // There is nothing to verify against, and accepting the login without a
  // second factor would defeat the point of having issued a challenge.
  if (!method) {
    throw new AppError(
      401,
      "Invalid or expired MFA challenge. Please log in again.",
      "MFA_CHALLENGE_INVALID",
    );
  }

  const delta = validateTotpCode(
    method.secretEnc,
    totpCode,
  );

  // Not a live TOTP code — try it as a recovery code before giving up.
  // The endpoint accepts either transparently: a user reaching for a
  // backup code is a user who cannot produce a TOTP one, and making them
  // find a different form to type it into serves nothing.
  //
  // Ordering matters. TOTP is checked first because it is the common
  // case, and because the formats do not overlap (6-8 digits vs.
  // xxxx-xxxx over a letter-bearing alphabet), so no input can be
  // ambiguous between them.
  if (delta === null) {
    const recovered = await useRecoveryCode(
      challenge.userId,
      totpCode,

      {
        applicationId,

        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
      },
    );

    if (recovered) {
      await consumeChallenge(
        challenge.id,
        applicationId,
        challenge.userId,
        method.id,
        metadata,
        { viaRecoveryCode: true },
      );

      return { userId: challenge.userId };
    }
  }

  if (delta === null) {
    const counted =
      await prisma.oneTimeToken.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });

    const exhausted =
      counted.attempts >=
      MFA_CHALLENGE_MAX_ATTEMPTS;

    if (exhausted) {
      // Burn it rather than leaving a token that only ever rejects.
      await prisma.oneTimeToken.updateMany({
        where: {
          id: challenge.id,
          usedAt: null,
        },

        data: { usedAt: new Date() },
      });
    }

    await logAuditEvent({
      action: "MFA_CHALLENGE_FAILED",
      actorType: AuditActorType.USER,

      applicationId,
      userId: challenge.userId,

      resourceType: "OneTimeToken",
      resourceId: challenge.id,

      ipAddress: metadata.ipAddress ?? null,
      userAgent: metadata.userAgent ?? null,

      metadata: {
        attempts: counted.attempts,
        challengeBurned: exhausted,
      },
    });

    throw new AppError(
      401,
      "Invalid code",
      "MFA_INVALID_CODE",
    );
  }

  await consumeChallenge(
    challenge.id,
    applicationId,
    challenge.userId,
    method.id,
    metadata,
    {
      clockDriftSteps: delta,
      attempts: challenge.attempts,
    },
  );

  // The session itself is created by the caller, which owns that concern.
  // NOTE the small window this leaves: the challenge is consumed here, so
  // if session creation then fails the user must log in again. Preferable
  // to the alternative — a challenge that survives a partial failure and
  // can be replayed.
  return { userId: challenge.userId };
}

/**
 * RECOVERY CODES — storage.
 *
 * `MfaRecoveryCode` exists in the schema for exactly this and is used
 * here: `id`, `userId`, `codeHash String @unique`, `usedAt DateTime?`,
 * `createdAt`, with `@@index([userId, usedAt])` — which is precisely the
 * query this file runs. No ambiguity to resolve, and no reason to reach
 * for `OneTimeToken`: that model would have forced an `applicationId` FK
 * onto a credential that is not application-scoped, and `TokenPurpose`
 * has no MFA_RECOVERY member to tag rows with.
 *
 * TWO THINGS THE SCHEMA IMPLIES, worth stating because they are decisions
 * by omission rather than by design:
 *
 *   1. There is no relation to `MfaMethod`. Recovery codes belong to the
 *      USER, not to a particular second factor. So they survive removing
 *      and re-enrolling TOTP unless something explicitly clears them —
 *      which is why regeneration below replaces the whole set, and why a
 *      future "disable MFA" endpoint must decide whether to delete them.
 *      Leaving live recovery codes behind on an account with no MFA would
 *      be a standing bypass.
 *
 *   2. There is no expiry column. A recovery code is good until used or
 *      replaced. That is the conventional behaviour and is fine, but it
 *      does mean a code printed out three years ago still opens the
 *      account.
 */

/**
 * Crockford-style base32 minus the characters people misread when copying
 * a code off a screen or a printout: 0/O, 1/I/L, and U (which is excluded
 * from Crockford's set to avoid accidental obscenities). 30 symbols.
 */
const RECOVERY_ALPHABET =
  "23456789ABCDEFGHJKMNPQRSTVWXYZ";

const RECOVERY_CODE_COUNT = 10;

const RECOVERY_GROUP_LENGTH = 4;
const RECOVERY_GROUPS = 2;

/**
 * 8 symbols from a 30-character alphabet is ~39 bits — around 550 billion
 * possibilities. Guessing one is not a threat model; losing the printout
 * is. The formatting (xxxx-xxxx) exists to make transcription reliable,
 * not to add entropy.
 */
function generateRecoveryCode(): string {
  const groups: string[] = [];

  for (let g = 0; g < RECOVERY_GROUPS; g += 1) {
    let group = "";

    for (
      let i = 0;
      i < RECOVERY_GROUP_LENGTH;
      i += 1
    ) {
      // randomInt is rejection-sampled, so this carries none of the
      // modulo bias that `randomBytes[i] % 30` would.
      group += RECOVERY_ALPHABET.charAt(
        randomInt(RECOVERY_ALPHABET.length),
      );
    }

    groups.push(group);
  }

  return groups.join("-");
}

/**
 * Canonical form for hashing and lookup.
 *
 * Users retype these from paper, so case and dashes must not matter —
 * "ab12-cd34", "AB12CD34" and " AB12-CD34 " all have to find the same
 * row. Normalisation happens on both the write and the read path; if
 * these ever diverge, every recovery code in the system silently stops
 * working.
 */
function normalizeRecoveryCode(
  code: string,
): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function hashRecoveryCode(
  code: string,
): string {
  return hashOpaqueToken(
    normalizeRecoveryCode(code),
  );
}

/**
 * Generates a fresh set of recovery codes, replacing any that exist.
 *
 * REPLACES, never appends: regenerating is what a user does when they
 * think the old list leaked, so the old list must stop working. Old rows
 * are deleted rather than stamped used — `usedAt` means "this code was
 * spent to get into the account", and marking a superseded code as used
 * would put a false entry in front of anyone auditing how an account was
 * accessed.
 *
 * Returns the raw codes. THIS IS THE ONLY TIME THEY EXIST IN READABLE
 * FORM — only HMACs are stored, so there is no way to show them again,
 * and no endpoint should ever try.
 *
 * Accepts an optional `tx` so setup confirmation can generate codes in the
 * same transaction that enables MFA — an account must never end up with
 * MFA on and no way back in.
 */
export async function generateRecoveryCodes(
  userId: string,
  options: {
    applicationId?: string | null;

    ipAddress?: string | null;
    userAgent?: string | null;

    tx?: Prisma.TransactionClient;
  } = {},
): Promise<string[]> {
  const codes = Array.from(
    { length: RECOVERY_CODE_COUNT },
    () => generateRecoveryCode(),
  );

  const run = async (
    tx: Prisma.TransactionClient,
  ) => {
    const replaced =
      await tx.mfaRecoveryCode.deleteMany({
        where: { userId },
      });

    await tx.mfaRecoveryCode.createMany({
      data: codes.map((code) => ({
        userId,
        codeHash: hashRecoveryCode(code),
      })),
    });

    await logAuditEvent({
      tx,

      action: "MFA_RECOVERY_CODES_GENERATED",
      actorType: AuditActorType.USER,

      applicationId:
        options.applicationId ?? null,

      userId,

      resourceType: "User",
      resourceId: userId,

      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,

      // Counts only. Never a code, never a hash.
      metadata: {
        generated: codes.length,
        replaced: replaced.count,
      },
    });
  };

  if (options.tx) {
    await run(options.tx);
  } else {
    await prisma.$transaction(run);
  }

  return codes;
}

/**
 * Spends a recovery code.
 *
 * Returns true if the code was valid and is now consumed, false
 * otherwise. Returns rather than throws because the caller — the login
 * challenge — treats "not a recovery code either" as one branch of a
 * single decision, not as an error in itself.
 *
 * A USED CODE IS A SIGNAL, NOT JUST A STATE CHANGE. Someone spending a
 * recovery code has usually lost their authenticator device — or someone
 * else has their printout. That is why this writes its own audit action
 * and a warn-level log line rather than folding into the generic
 * challenge-success entry: it is the sort of event a security team wants
 * to be able to alert on directly.
 */
export async function useRecoveryCode(
  userId: string,
  code: string,
  options: {
    applicationId?: string | null;

    ipAddress?: string | null;
    userAgent?: string | null;
  } = {},
): Promise<boolean> {
  const codeHash = hashRecoveryCode(code);

  // codeHash is globally @unique, so this finds at most one row; the
  // userId check below is what stops one user's code from unlocking
  // another's account.
  const existing =
    await prisma.mfaRecoveryCode.findUnique({
      where: { codeHash },

      select: {
        id: true,
        userId: true,
        usedAt: true,
      },
    });

  if (
    !existing ||
    existing.userId !== userId ||
    existing.usedAt
  ) {
    return false;
  }

  const remaining = await prisma.$transaction(
    async (tx) => {
      // Guarded on usedAt: null — two concurrent submissions of the same
      // code must not both succeed.
      const consumed =
        await tx.mfaRecoveryCode.updateMany({
          where: {
            id: existing.id,
            usedAt: null,
          },

          data: { usedAt: new Date() },
        });

      if (consumed.count !== 1) {
        return null;
      }

      const left =
        await tx.mfaRecoveryCode.count({
          where: {
            userId,
            usedAt: null,
          },
        });

      await logAuditEvent({
        tx,

        action: "MFA_RECOVERY_CODE_USED",
        actorType: AuditActorType.USER,

        applicationId:
          options.applicationId ?? null,

        userId,

        resourceType: "MfaRecoveryCode",
        resourceId: existing.id,

        ipAddress: options.ipAddress ?? null,
        userAgent: options.userAgent ?? null,

        metadata: {
          remainingCodes: left,
        },
      });

      return left;
    },
  );

  if (remaining === null) {
    return false;
  }

  // warn, not info: this is an account being opened without the enrolled
  // device, and it is worth surfacing in whatever watches the logs.
  logger.warn(
    {
      userId,
      remainingCodes: remaining,
    },
    "MFA recovery code used — user may have lost their authenticator device",
  );

  return true;
}

/**
 * How many unused recovery codes a user has left.
 *
 * A count and nothing else. There is deliberately no endpoint that
 * returns the codes themselves — only hashes are stored, so it would be
 * impossible anyway, and an endpoint that appeared to offer it would
 * invite someone to store them in plaintext to make it work.
 */
export async function countRemainingRecoveryCodes(
  userId: string,
): Promise<number> {
  return prisma.mfaRecoveryCode.count({
    where: {
      userId,
      usedAt: null,
    },
  });
}
