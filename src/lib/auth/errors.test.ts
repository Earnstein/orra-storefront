import { describe, expect, it } from "vitest";

import { authErrorMessage, GENERIC_ERROR } from "@/lib/auth/errors";

describe("authErrorMessage", () => {
  it.each([
    ["INVALID_EMAIL_OR_PASSWORD", "That email and password don't match."],
    ["USER_ALREADY_EXISTS", "An account with this email already exists."],
    ["USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", "An account with this email already exists."],
    ["INVALID_TOKEN", "This link has expired or was already used."],
    ["INVALID_PASSWORD", "That password isn't right."],
    ["PASSWORD_REQUIRED", "Enter your password."],
    ["PASSWORD_TOO_SHORT", "Use at least 8 characters."],
    ["PASSWORD_TOO_LONG", "Use at most 128 characters."],
  ])("maps %s", (code, message) => {
    expect(authErrorMessage({ code })).toBe(message);
  });

  it("explains a rate limit, which Better Auth sends as a bare 429", () => {
    expect(authErrorMessage({ status: 429 })).toBe("Too many attempts. Wait a few minutes and try again.");
  });

  it("falls back for anything else, including network failures", () => {
    expect(authErrorMessage({ code: "SOMETHING_NEW" })).toBe(GENERIC_ERROR);
    expect(authErrorMessage({ status: 500 })).toBe(GENERIC_ERROR);
    expect(authErrorMessage(null)).toBe(GENERIC_ERROR);
    expect(authErrorMessage(undefined)).toBe(GENERIC_ERROR);
    expect(GENERIC_ERROR).toBe("Something went wrong. Try again.");
  });
});
