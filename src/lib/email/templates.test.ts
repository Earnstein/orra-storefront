import { describe, expect, it } from "vitest";

import { orderConfirmationEmail, resetPasswordEmail } from "@/lib/email/templates";

const url = "https://orra-storefront.vercel.app/api/auth/reset-password/tok_123?callbackURL=%2Fsign-in%2Freset-password";

describe("resetPasswordEmail", () => {
  it("has the subject and the link in both parts", () => {
    const email = resetPasswordEmail({ url });
    expect(email.subject).toBe("Reset your Orra password");
    expect(email.text).toContain(url);
    expect(email.html).toContain(`href="${url}"`);
  });

  it("carries no text a visitor chose (sign-up isn't verified, so a name could be a lure)", () => {
    const email = resetPasswordEmail({ url });
    expect(email.text.match(/https?:\/\/\S+/g)).toEqual([url]);
  });

  it("escapes characters in the link that would break the attribute", () => {
    const { html } = resetPasswordEmail({ url: `${url}&a="b"` });
    expect(html).toContain(`href="${url}&amp;a=&quot;b&quot;"`);
  });
});

describe("orderConfirmationEmail", () => {
  const input = {
    number: "ORR-10001",
    items: [
      { name: "Leather tote", unitPrice: 189000, quantity: 1 },
      { name: `Scarf <b>"silk"</b>`, unitPrice: 45000, quantity: 2 },
    ],
    subtotal: 279000,
    shipping: { name: "Ada <script>", line1: "1 Main St", line2: null, city: "Springfield", state: "IL", postalCode: "62701", country: "US" },
    delivery: { earliest: new Date("2026-10-19T12:00:00Z"), latest: new Date("2026-10-21T12:00:00Z") },
    url: "https://orra-storefront.vercel.app/orders/ORR-10001?key=abc&x=1",
  };

  it("names the order, lists the items and totals, the address, the delivery window and the link", () => {
    const email = orderConfirmationEmail(input);
    expect(email.subject).toBe("Your Orra order ORR-10001 is confirmed");
    for (const part of [email.text, email.html]) {
      expect(part).toContain("Thank you — order ORR-10001 is confirmed");
      expect(part).toContain("$1,890");
      expect(part).toContain("$900");
      expect(part).toContain("$2,790");
      expect(part).toContain("Springfield, IL 62701");
      expect(part).toContain("Mon, Oct 19 – Wed, Oct 21");
    }
    expect(email.text).toContain("1 × Leather tote");
    expect(email.text).toContain(input.url);
    expect(email.html).toContain(`href="https://orra-storefront.vercel.app/orders/ORR-10001?key=abc&amp;x=1"`);
  });

  it("escapes names and the address (the shopper's own text)", () => {
    const { html } = orderConfirmationEmail(input);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("Ada &lt;script&gt;");
    expect(html).toContain("Scarf &lt;b&gt;&quot;silk&quot;&lt;/b&gt;");
  });

  it("leaves the address out when there is none", () => {
    const email = orderConfirmationEmail({ ...input, shipping: null });
    expect(email.text).not.toContain("Delivering to");
    expect(email.html).not.toContain("Delivering to");
  });
});
