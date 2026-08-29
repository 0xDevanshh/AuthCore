/**
 * HTML email bodies.
 *
 * Deliberately plain: inline styles only, table-free, no external
 * stylesheet or webfont. Email clients strip <style> blocks and most
 * ignore anything beyond a small subset of CSS, so every rule that matters
 * lives on the element. Worth improving later — a proper table layout for
 * Outlook, a text/plain alternative part — but not before the flow works.
 */

/**
 * Escapes text interpolated into HTML.
 *
 * The only interpolated value today is a URL this server builds itself,
 * but a template that concatenates unescaped strings invites the next one
 * to carry a user-supplied name.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Shared shell — heading, one line of copy, a button, and a paste-able
 * fallback link. Extracted so a second template does not mean a second
 * copy of the same inline styles to keep in sync.
 */
function actionEmail(options: {
  heading: string;
  body: string;
  buttonLabel: string;
  url: string;
  footer?: string;
}): string {
  const href = escapeHtml(options.url);

  const footer = options.footer
    ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#8a8a8a;">${escapeHtml(options.footer)}</p>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <div style="max-width:480px;margin:0 auto;padding:32px;background-color:#ffffff;border-radius:8px;">
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;">${escapeHtml(options.heading)}</h1>

      <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#4a4a4a;">
        ${escapeHtml(options.body)}
      </p>

      <a href="${href}" style="display:inline-block;padding:12px 20px;background-color:#1a1a1a;color:#ffffff;font-size:15px;font-weight:500;text-decoration:none;border-radius:6px;">
        ${escapeHtml(options.buttonLabel)}
      </a>

      <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#8a8a8a;">
        If the button doesn't work, paste this link into your browser:<br />
        <a href="${href}" style="color:#8a8a8a;word-break:break-all;">${href}</a>
      </p>

      ${footer}
    </div>
  </body>
</html>`;
}

export function passwordResetEmailTemplate(
  resetUrl: string,
): string {
  return actionEmail({
    heading: "Reset your password",

    body: "Choose a new password using the link below. It expires in an hour.",

    buttonLabel: "Reset password",

    url: resetUrl,

    // Worth saying on this one and not on verification: an unexpected
    // reset email is the first sign someone else is trying to get in, and
    // ignoring it is the correct response — the old password still works
    // until the link is used.
    footer:
      "If you didn't ask for this, you can ignore this email — your password won't change.",
  });
}

export function verificationEmailTemplate(
  verifyUrl: string,
): string {
  return actionEmail({
    heading: "Verify your email",

    body: "Confirm this address to finish setting up your account.",

    buttonLabel: "Verify email",

    url: verifyUrl,
  });
}
