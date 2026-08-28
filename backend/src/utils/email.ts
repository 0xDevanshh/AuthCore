import { Resend } from "resend";

import { env } from "../config/env.ts";
import { logger } from "../config/logger.ts";

import { verificationEmailTemplate } from "./email-templates.ts";

/**
 * Single client for the process. The SDK is a thin wrapper over fetch and
 * holds no connection state, so one instance is enough and avoids
 * re-reading the key on every send.
 */
const resend = new Resend(
  env.RESEND_API_KEY,
);

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends one email.
 *
 * Throws on failure, unlike `logAuditEvent`, which swallows its errors.
 * The asymmetry is intentional: an audit row is a record of something that
 * already happened, whereas an undelivered verification or reset email is
 * the whole point of the request — the caller has to know it did not go
 * out so it can tell the user or retry. Callers that would rather degrade
 * than fail catch this themselves; see the signup path in auth.service.ts.
 *
 * `html` is never logged. It carries the verification link, and a raw
 * one-time token in a log file is a credential in a log file — the whole
 * reason only the token's hash reaches the database.
 */
export async function sendEmail(
  params: SendEmailParams,
): Promise<void> {
  try {
    const result = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    // The SDK reports a rejected send in `error` rather than by throwing,
    // so a send that never left Resend would otherwise look successful.
    if (result.error) {
      throw new Error(
        result.error.message,
      );
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    logger.error(
      {
        to: params.to,
        subject: params.subject,
        err: message,
      },
      "Failed to send email",
    );

    throw error;
  }
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

/**
 * TODO(email): invitations still log instead of sending. Now that a real
 * transport exists this is a small change — build the body the way
 * `sendVerificationEmail` does and call `sendEmail` — but it needs its own
 * template and its own decision about whether a failed send should fail
 * `sendInvitation`, so it is left for the invitation work rather than
 * changed in passing here.
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
      "Invitation email not sent: no template wired to the transport yet",
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

export function buildEmailVerificationUrl(
  rawToken: string,
): string {
  // Reuses FRONTEND_URL, the same origin app.ts allows through CORS —
  // the verification page is a frontend route, not an API endpoint.
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

/**
 * Sends a verification email. Throws if the send fails — see `sendEmail`.
 */
export async function sendVerificationEmail(
  to: string,
  verifyUrl: string,
): Promise<void> {
  await sendEmail({
    to,

    subject: "Verify your email",

    html: verificationEmailTemplate(
      verifyUrl,
    ),
  });
}
