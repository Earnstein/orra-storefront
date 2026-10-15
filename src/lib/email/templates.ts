import type { Email } from "@/lib/email/send";
import { formatPrice } from "@/lib/format";
import { site } from "@/lib/site";

type EmailContent = Omit<Email, "to">;

/**
 * The password reset email: plain HTML in the house style (monochrome, one black button), plus text.
 * It holds no text a visitor chose: sign-up isn't verified, so anyone can register someone else's
 * address with a "name" that reads as a lure and then request a reset for it.
 */
export function resetPasswordEmail({ url }: { url: string }): EmailContent {
  const subject = `Reset your ${site.name} password`;
  const intro = "We received a request to reset your password. The link below works once and expires in 1 hour.";
  const ignore = "If you didn't ask for this, you can ignore this email; your password won't change.";

  const text = ["Hello,", "", intro, "", url, "", ignore, "", site.name].join("\n");

  const html = layout(`
    <p style="margin:0 0 16px">Hello,</p>
    <p style="margin:0 0 24px">${intro}</p>
    <p style="margin:0 0 24px">
      <a href="${escapeHtml(url)}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:14px 28px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase">Reset password</a>
    </p>
    <p style="margin:0;color:#666">${ignore}</p>`);

  return { subject, html, text };
}

export type OrderEmailInput = {
  number: string;
  items: { name: string; unitPrice: number; quantity: number }[];
  subtotal: number;
  shipping: { name: string; line1: string; line2: string | null; city: string; state: string; postalCode: string; country: string } | null;
  delivery: { earliest: Date; latest: Date };
  /** The order's page: the account's for a shopper, or the guest link with its key. */
  url: string;
};

const deliveryDate = new Intl.DateTimeFormat(site.locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * The order confirmation: number, items, totals, delivery address, estimated delivery and a link
 * to the order. The address and names are the shopper's own text, so every value is escaped.
 */
export function orderConfirmationEmail({ number, items, subtotal, shipping, delivery, url }: OrderEmailInput): EmailContent {
  const subject = `Your ${site.name} order ${number} is confirmed`;
  const when = `${deliveryDate.format(delivery.earliest)} – ${deliveryDate.format(delivery.latest)}`;
  const address = shipping
    ? [shipping.name, shipping.line1, shipping.line2, `${shipping.city}, ${shipping.state} ${shipping.postalCode}`, shipping.country].filter((line): line is string => Boolean(line))
    : [];

  const text = [
    `Thank you — order ${number} is confirmed.`,
    "",
    ...items.map((item) => `${item.quantity} × ${item.name} — ${formatPrice(item.unitPrice * item.quantity)}`),
    "",
    `Subtotal: ${formatPrice(subtotal)}`,
    "Delivery: Complimentary",
    `Total: ${formatPrice(subtotal)}`,
    "",
    ...(address.length > 0 ? ["Delivering to:", ...address, ""] : []),
    `Estimated delivery: ${when}`,
    "",
    `View your order: ${url}`,
    "",
    "Payments run in Stripe test mode — no real money was taken.",
    "",
    site.name,
  ].join("\n");

  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;border-top:1px solid #e5e5e5">${escapeHtml(item.name)}<br><span style="color:#666">Quantity ${item.quantity}</span></td>
        <td style="padding:8px 0;border-top:1px solid #e5e5e5;text-align:right;vertical-align:top">${formatPrice(item.unitPrice * item.quantity)}</td>
      </tr>`,
    )
    .join("");

  const html = layout(`
    <p style="margin:0 0 24px;font-size:18px">Thank you — order ${escapeHtml(number)} is confirmed</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 16px">${rows}
      <tr><td style="padding:8px 0;border-top:1px solid #e5e5e5">Subtotal</td><td style="padding:8px 0;border-top:1px solid #e5e5e5;text-align:right">${formatPrice(subtotal)}</td></tr>
      <tr><td style="padding:0 0 8px">Delivery</td><td style="padding:0 0 8px;text-align:right">Complimentary</td></tr>
      <tr><td style="padding:8px 0;border-top:1px solid #000">Total</td><td style="padding:8px 0;border-top:1px solid #000;text-align:right">${formatPrice(subtotal)}</td></tr>
    </table>
    ${address.length > 0 ? `<p style="margin:0 0 16px"><span style="color:#666">Delivering to</span><br>${address.map(escapeHtml).join("<br>")}</p>` : ""}
    <p style="margin:0 0 24px"><span style="color:#666">Estimated delivery</span><br>${when}</p>
    <p style="margin:0 0 24px">
      <a href="${escapeHtml(url)}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:14px 28px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase">View your order</a>
    </p>
    <p style="margin:0;color:#666">Payments run in Stripe test mode — no real money was taken.</p>`);

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
