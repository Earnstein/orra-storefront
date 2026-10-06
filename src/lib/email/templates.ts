import type { Email } from "@/lib/email/send";
import { site } from "@/lib/site";

type EmailContent = Omit<Email, "to">;

/** The password reset email: plain HTML in the house style (monochrome, one black button), plus text. */
export function resetPasswordEmail({ name, url }: { name: string; url: string }): EmailContent {
  const subject = `Reset your ${site.name} password`;
  const intro = "We received a request to reset your password. The link below works once and expires in 1 hour.";
  const ignore = "If you didn't ask for this, you can ignore this email; your password won't change.";

  const text = [`Hello ${name},`, "", intro, "", url, "", ignore, "", site.name].join("\n");

  const html = layout(`
    <p style="margin:0 0 16px">Hello ${escapeHtml(name)},</p>
    <p style="margin:0 0 24px">${intro}</p>
    <p style="margin:0 0 24px">
      <a href="${escapeHtml(url)}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:14px 28px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase">Reset password</a>
    </p>
    <p style="margin:0;color:#666">${ignore}</p>`);

  return { subject, html, text };
}

function layout(body: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#fff;color:#000;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6">
    <div style="max-width:480px;margin:0 auto">
      <p style="margin:0 0 32px;font-size:13px;letter-spacing:0.3em;text-transform:uppercase">${site.name}</p>
      ${body.trim()}
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
