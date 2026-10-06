import { describe, expect, it } from "vitest";

import { resetPasswordEmail } from "@/lib/email/templates";

const url = "https://orra-storefront.vercel.app/api/auth/reset-password/tok_123?callbackURL=%2Fsign-in%2Freset-password";

describe("resetPasswordEmail", () => {
  it("has the subject, the name and the link in both parts", () => {
    const email = resetPasswordEmail({ name: "Ada", url });
    expect(email.subject).toBe("Reset your Orra password");
    expect(email.text).toContain("Ada");
    expect(email.text).toContain(url);
    expect(email.html).toContain(`href="${url}"`);
    expect(email.html).toContain("Ada");
  });

  it("escapes the name in the HTML", () => {
    const { html } = resetPasswordEmail({ name: `<script>alert("x")</script>`, url });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes characters in the link that would break the attribute", () => {
    const { html } = resetPasswordEmail({ name: "Ada", url: `${url}&a="b"` });
    expect(html).toContain(`href="${url}&amp;a=&quot;b&quot;"`);
  });
});
