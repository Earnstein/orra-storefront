import { beforeEach, describe, expect, it } from "vitest";

import { authOptions } from "@/lib/auth.options";
import { cookiesFrom, createTestAuth } from "@/test/auth";

type TestAuth = Awaited<ReturnType<typeof createTestAuth>>;

const ada = { name: "Ada", email: "ada@example.test", password: "correct-horse" };

/** The Better Auth error code a rejected API call carries. */
async function codeOf(call: Promise<unknown>): Promise<string | undefined> {
  try {
    await call;
  } catch (error) {
    return (error as { body?: { code?: string } }).body?.code;
  }
  throw new Error("expected the call to fail");
}

let t: TestAuth;

beforeEach(async () => {
  t = await createTestAuth();
});

async function signUp(user = ada) {
  const { headers, response } = await t.auth.api.signUpEmail({ body: user, returnHeaders: true });
  return { cookies: cookiesFrom(headers), user: response.user };
}

describe("passwords", () => {
  it("needs 8 characters at sign-up", async () => {
    expect(await codeOf(t.auth.api.signUpEmail({ body: { ...ada, password: "1234567" } }))).toBe("PASSWORD_TOO_SHORT");
    const { response } = await t.auth.api.signUpEmail({ body: { ...ada, password: "12345678" }, returnHeaders: true });
    expect(response.token).toBeTruthy();
  });

  it("allows at most 128 characters", async () => {
    expect(await codeOf(t.auth.api.signUpEmail({ body: { ...ada, password: "x".repeat(129) } }))).toBe("PASSWORD_TOO_LONG");
  });
});

describe("sign up and sign in", () => {
  it("refuses a second account for the same email", async () => {
    await signUp();
    expect(await codeOf(t.auth.api.signUpEmail({ body: ada }))).toMatch(/^USER_ALREADY_EXISTS(_USE_ANOTHER_EMAIL)?$/);
  });

  it("refuses a wrong password", async () => {
    await signUp();
    expect(await codeOf(t.auth.api.signInEmail({ body: { email: ada.email, password: "wrong-password" } })))
      .toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("signs in for 30 days", async () => {
    await signUp();
    const before = Date.now();
    const { headers } = await t.auth.api.signInEmail({ body: { email: ada.email, password: ada.password }, returnHeaders: true });
    const session = await t.auth.api.getSession({ headers: cookiesFrom(headers) });
    const days = (session!.session.expiresAt.getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });
});

describe("password reset", () => {
  it("emails a link whose token sets a new password and signs out every device", async () => {
    const { cookies } = await signUp();
    await t.auth.api.requestPasswordReset({ body: { email: ada.email, redirectTo: "/sign-in/reset-password" } });

    expect(t.outbox).toHaveLength(1);
    const [email] = t.outbox;
    expect(email.to).toBe(ada.email);
    expect(email.subject).toBe("Reset your Orra password");
    const token = email.text.match(/\/reset-password\/([^?\s]+)/)?.[1];
    expect(token).toBeTruthy();

    await t.auth.api.resetPassword({ body: { token: token!, newPassword: "new-password-1" } });

    expect(await t.auth.api.getSession({ headers: cookies, query: { disableCookieCache: true } })).toBeNull();
    expect(await codeOf(t.auth.api.signInEmail({ body: { email: ada.email, password: ada.password } })))
      .toBe("INVALID_EMAIL_OR_PASSWORD");
    const signedIn = await t.auth.api.signInEmail({ body: { email: ada.email, password: "new-password-1" } });
    expect(signedIn.user.email).toBe(ada.email);
  });

  it("answers the same for an unknown email and sends nothing", async () => {
    const answer = await t.auth.api.requestPasswordReset({ body: { email: "nobody@example.test" } });
    expect(answer.status).toBe(true);
    expect(t.outbox).toHaveLength(0);
  });

  it("refuses a used token", async () => {
    await signUp();
    await t.auth.api.requestPasswordReset({ body: { email: ada.email } });
    const token = t.outbox[0].text.match(/\/reset-password\/([^?\s]+)/)![1];
    await t.auth.api.resetPassword({ body: { token, newPassword: "new-password-1" } });
    expect(await codeOf(t.auth.api.resetPassword({ body: { token, newPassword: "new-password-2" } }))).toBe("INVALID_TOKEN");
  });
});

describe("cookie cache", () => {
  it("keeps accepting a revoked session from its cache cookie, unless the cache is skipped", async () => {
    const { cookies } = await signUp();
    expect(cookies.get("cookie")).toMatch(/session_data=/);

    const { token } = (await t.auth.api.getSession({ headers: cookies }))!.session;
    await t.auth.api.revokeSession({ body: { token }, headers: cookies });

    // The 5-minute lag the spec accepts for browser reads...
    expect(await t.auth.api.getSession({ headers: cookies })).not.toBeNull();
    // ...and what getCurrentUser() does instead.
    expect(await t.auth.api.getSession({ headers: cookies, query: { disableCookieCache: true } })).toBeNull();
  });
});

describe("deleting an account", () => {
  it("needs the right password", async () => {
    const { cookies } = await signUp();
    expect(await codeOf(t.auth.api.deleteUser({ body: { password: "wrong-password" }, headers: cookies }))).toBe("INVALID_PASSWORD");
    expect(await t.auth.api.getSession({ headers: cookies, query: { disableCookieCache: true } })).not.toBeNull();

    await t.auth.api.deleteUser({ body: { password: ada.password }, headers: cookies });
    expect(await codeOf(t.auth.api.signInEmail({ body: { email: ada.email, password: ada.password } })))
      .toBe("INVALID_EMAIL_OR_PASSWORD");
  });
});

describe("rate limits", () => {
  it("are stored in the database with the spec's limits", () => {
    expect(authOptions.rateLimit.storage).toBe("database");
    expect(authOptions.rateLimit.customRules).toEqual({
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/request-password-reset": { window: 900, max: 3 },
    });
  });
});
