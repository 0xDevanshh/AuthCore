import { env } from "../config/env.ts";
import { logger } from "../config/logger.ts";

/**
 * Email delivery stub.
 *
 * TODO(email): no mail transport exists in this codebase yet — no
 * nodemailer/Resend/SES dependency, no provider credentials in env. This
 * logs instead of sending so the invitation flow is exercisable end to end;
 * swap the body for a real transport when one is chosen.
 *
 * The invite link carries the raw token, so it is logged only outside
 * production. In production the token is withheld from the log, which means
 * invitations genuinely cannot be delivered until a transport exists.
 */
export interface InvitationEmail {
  to: string;
  applicationName: string;
  acceptUrl: string;
}

export function sendInvitationEmail(
  email: InvitationEmail,
): void {
  if (env.NODE_ENV === "production") {
    logger.warn(
      {
        to: email.to,
        application: email.applicationName,
      },
      "Invitation email not sent: no mail transport configured",
    );

    return;
  }

  logger.info(
    {
      to: email.to,
      application: email.applicationName,
      acceptUrl: email.acceptUrl,
    },
    "Invitation email (stub — not actually sent)",
  );
}

export function buildInvitationAcceptUrl(
  rawToken: string,
): string {
  const url = new URL(
    "/invitations/accept",
    env.FRONTEND_URL,
  );

  url.searchParams.set(
    "token",
    rawToken,
  );

  return url.toString();
}

export interface EmailVerificationEmail {
  to: string;
  verifyUrl: string;
}

/**
 * Same stub treatment as invitations — see the TODO(email) above.
 *
 * Signup is deliberately not blocked on verification (that is a product
 * decision for later), so an undelivered verification email degrades the
 * account rather than locking the user out of it.
 */
export function sendEmailVerificationEmail(
  email: EmailVerificationEmail,
): void {
  if (env.NODE_ENV === "production") {
    logger.warn(
      { to: email.to },
      "Verification email not sent: no mail transport configured",
    );

    return;
  }

  logger.info(
    {
      to: email.to,
      verifyUrl: email.verifyUrl,
    },
    "Email verification (stub — not actually sent)",
  );
}

export function buildEmailVerificationUrl(
  rawToken: string,
): string {
  const url = new URL(
    "/verify-email",
    env.FRONTEND_URL,
  );

  url.searchParams.set(
    "token",
    rawToken,
  );

  return url.toString();
}
