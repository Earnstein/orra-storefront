import { describe, expect, it } from "vitest";

import { safeReturnTo, signInPath } from "@/lib/auth/return-to";

describe("safeReturnTo", () => {
  it.each([
    ["protocol-relative", "//evil.com"],
    ["absolute", "https://evil.com"],
    ["backslash", "/\\evil.com"],
    ["tab inside", "/\t/evil.com"],
    ["dot segment to protocol-relative", "/.//evil.com"],
    ["dot-dot segment to protocol-relative", "/..//evil.com"],
    ["script", "javascript:alert(1)"],
    ["relative", "products/x"],
    ["empty", ""],
    ["sign-in itself", "/sign-in"],
    ["sign-in with a query", "/sign-in?x=1"],
    ["sign-in subpage", "/sign-in/forgot-password"],
    ["sign-up", "/sign-up"],
    ["sign-up with a query", "/sign-up?returnTo=/x"],
    ["too long", `/${"x".repeat(600)}`],
  ])("falls back to /account for %s", (_, value) => {
    expect(safeReturnTo(value)).toBe("/account");
  });

  it("falls back for missing values, and to a given fallback", () => {
    expect(safeReturnTo(null)).toBe("/account");
    expect(safeReturnTo(undefined)).toBe("/account");
    expect(safeReturnTo("//evil.com", "/")).toBe("/");
  });

  it("keeps a path on this site with its query and hash", () => {
    expect(safeReturnTo("/products/leather-tote-tan?x=1#y")).toBe("/products/leather-tote-tan?x=1#y");
    expect(safeReturnTo("/account")).toBe("/account");
    expect(safeReturnTo("/")).toBe("/");
    expect(safeReturnTo("/sign-inside")).toBe("/sign-inside");
    expect(safeReturnTo("/sign-ups")).toBe("/sign-ups");
  });
});

describe("signInPath", () => {
  it("encodes where to come back to", () => {
    expect(signInPath("/account/x?y=1")).toBe("/sign-in?returnTo=%2Faccount%2Fx%3Fy%3D1");
  });
});
