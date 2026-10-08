import { describe, expect, it } from "vitest";

import { emailSchema, nameSchema, passwordSchema, signInSchema, signUpSchema } from "@/lib/auth/schemas";

const firstError = (result: { success: boolean; error?: { issues: { message: string }[] } }) => result.error?.issues[0]?.message;

describe("auth form schemas", () => {
  it("checks the email", () => {
    for (const bad of ["", "a@b", "ada", "ada@example"]) expect(emailSchema.safeParse(bad).success, bad).toBe(false);
    expect(firstError(emailSchema.safeParse("a@b"))).toBe("Enter a valid email address.");
    expect(emailSchema.parse("  Ada@Example.test ")).toBe("ada@example.test");
  });

  it("checks the password length (8–128)", () => {
    expect(firstError(passwordSchema.safeParse("1234567"))).toBe("Use at least 8 characters.");
    expect(firstError(passwordSchema.safeParse("x".repeat(129)))).toBe("Use at most 128 characters.");
    expect(passwordSchema.parse("12345678")).toBe("12345678");
    expect(passwordSchema.parse(" spaces count ")).toBe(" spaces count ");
  });

  it("checks the name (1–80, trimmed)", () => {
    expect(firstError(nameSchema.safeParse("   "))).toBe("Enter your name.");
    expect(firstError(nameSchema.safeParse("x".repeat(81)))).toBe("Use at most 80 characters.");
    expect(nameSchema.parse("  Ada Lovelace ")).toBe("Ada Lovelace");
  });

  it("signs in with any non-empty password, so old rules never lock anyone out", () => {
    expect(signInSchema.safeParse({ email: "ada@example.test", password: "", rememberMe: true }).success).toBe(false);
    expect(signInSchema.parse({ email: "ada@example.test", password: "short", rememberMe: false })).toEqual({
      email: "ada@example.test",
      password: "short",
      rememberMe: false,
    });
  });

  it("signs up with a name, an email and a valid password", () => {
    expect(signUpSchema.safeParse({ name: "", email: "ada@example.test", password: "correct-horse" }).success).toBe(false);
    expect(signUpSchema.safeParse({ name: "Ada", email: "ada@example.test", password: "1234567" }).success).toBe(false);
    expect(signUpSchema.parse({ name: " Ada ", email: "ada@example.test", password: "correct-horse" })).toEqual({
      name: "Ada",
      email: "ada@example.test",
      password: "correct-horse",
    });
  });
});
