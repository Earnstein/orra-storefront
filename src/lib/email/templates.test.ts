import { describe, expect, it } from "vitest";

import { resetPasswordEmail } from "@/lib/email/templates";

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
