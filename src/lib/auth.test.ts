import { count, eq, like } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimit, user as users } from "@/db/schema";
import { authOptions } from "@/lib/auth.options";
import { cookiesFrom, createTestAuth } from "@/test/auth";

type TestAuth = Awaited<ReturnType<typeof createTestAuth>>;

// One database for the file (a fresh PGlite per test is slow enough to time out other suites
// running in parallel), so each test signs up its own user.
let ada = { name: "Ada", email: "", password: "correct-horse" };
let next = 0;

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

beforeAll(async () => {
  t = await createTestAuth();
});

beforeEach(() => {
  ada = { ...ada, email: `ada-${++next}@example.test` };
  t.outbox.length = 0;
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

  it("checks a session without the cache in one database query (session and user joined)", async () => {
    const { cookies, user } = await signUp();
    const client = (t.db as unknown as { $client: { query: (...args: unknown[]) => unknown } }).$client;
    const query = vi.spyOn(client, "query");
    try {
      const session = await t.auth.api.getSession({ headers: cookies, query: { disableCookieCache: true } });
      expect(session?.user.id).toBe(user.id);
      expect(query).toHaveBeenCalledTimes(1);
    } finally {
      query.mockRestore();
    }
  });
});

describe("deleting an account", () => {
  it("needs a password even on a fresh session", async () => {
    const { cookies } = await signUp();
    expect(await codeOf(t.auth.api.deleteUser({ body: {}, headers: cookies }))).toBe("PASSWORD_REQUIRED");
    expect(await t.auth.api.getSession({ headers: cookies, query: { disableCookieCache: true } })).not.toBeNull();
  });

  it("needs the right password", async () => {
    const { cookies } = await signUp();
    expect(await codeOf(t.auth.api.deleteUser({ body: { password: "wrong-password" }, headers: cookies }))).toBe("INVALID_PASSWORD");
    expect(await t.auth.api.getSession({ headers: cookies, query: { disableCookieCache: true } })).not.toBeNull();

    await t.auth.api.deleteUser({ body: { password: ada.password }, headers: cookies });
    expect(await codeOf(t.auth.api.signInEmail({ body: { email: ada.email, password: ada.password } })))
      .toBe("INVALID_EMAIL_OR_PASSWORD");
  });
});

/** The HTTP status a rejected API call carries. */
async function statusOf(call: Promise<unknown>): Promise<number | undefined> {
  try {
    await call;
  } catch (error) {
    return (error as { statusCode?: number }).statusCode;
  }
  throw new Error("expected the call to fail");
}

describe("roles", () => {
  /** Signs up, gives the account a role in the database, then signs in again so the session carries it. */
  async function signUpAs(role: string) {
    const { user } = await signUp();
    await t.db.update(users).set({ role }).where(eq(users.id, user.id));
    const { headers } = await t.auth.api.signInEmail({ body: { email: ada.email, password: ada.password }, returnHeaders: true });
    return { cookies: cookiesFrom(headers), user };
  }

  async function roleOf(id: string) {
    const [row] = await t.db.select({ role: users.role }).from(users).where(eq(users.id, id));
    return row.role;
  }

  it("makes every new account a shopper, and refuses a sign-up that asks for a role", async () => {
    expect(await statusOf(t.auth.api.signUpEmail({ body: { ...ada, role: "admin" } as typeof ada }))).toBe(400);
    const { user } = await signUp();
    expect(await roleOf(user.id)).toBe("user");
  });

  it("lets the owner list users", async () => {
    const { cookies } = await signUpAs("admin");
    const { users: listed } = await t.auth.api.listUsers({ query: {}, headers: cookies });
    expect(listed.length).toBeGreaterThan(0);
  });

  it("refuses the demo admin every user and session action, and leaves its role alone", async () => {
    const { cookies, user } = await signUpAs("demo-admin");
    const shopper = await signUp({ ...ada, email: `shopper-${next}@example.test` });

    expect(await statusOf(t.auth.api.listUsers({ query: {}, headers: cookies }))).toBe(403);
    expect(await statusOf(t.auth.api.setRole({ body: { userId: user.id, role: "admin" }, headers: cookies }))).toBe(403);
    expect(await statusOf(t.auth.api.impersonateUser({ body: { userId: shopper.user.id }, headers: cookies }))).toBe(403);
    expect(await statusOf(t.auth.api.revokeUserSessions({ body: { userId: shopper.user.id }, headers: cookies }))).toBe(403);

    expect(await roleOf(user.id)).toBe("demo-admin");
    expect(await t.auth.api.getSession({ headers: shopper.cookies, query: { disableCookieCache: true } })).not.toBeNull();
  });

  it("refuses shoppers too", async () => {
    const { cookies } = await signUp();
    expect(await statusOf(t.auth.api.listUsers({ query: {}, headers: cookies }))).toBe(403);
  });
});

describe("rate limits", () => {
  it("are stored in the database with the spec's limits", () => {
    expect(authOptions.rateLimit.storage).toBe("database");
    expect(authOptions.rateLimit.customRules).toEqual({
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/request-password-reset": { window: 900, max: 3 },
      "/change-password": { window: 60, max: 5 },
      "/delete-user": { window: 60, max: 5 },
      "/get-session": false,
    });
  });

  it("refuse a sixth sign-in a minute from one IP, counted in the database", async () => {
    const limited = await createTestAuth(t.db, { rateLimit: true });
    const signIn = () =>
      limited.auth.handler(
        new Request("http://localhost:3000/api/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": "203.0.113.7" },
          body: JSON.stringify({ email: "nobody@example.test", password: "wrong-password" }),
        }),
      );
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await signIn()).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it("leave session reads alone, so they don't write to the database", async () => {
    const limited = await createTestAuth(t.db, { rateLimit: true });
    for (let i = 0; i < 3; i++) {
      const response = await limited.auth.handler(
        new Request("http://localhost:3000/api/auth/get-session", { headers: { "x-forwarded-for": "203.0.113.8" } }),
      );
      expect(response.status).toBe(200);
    }
    const [{ n }] = await t.db.select({ n: count() }).from(rateLimit).where(like(rateLimit.key, "%/get-session"));
    expect(n).toBe(0);
  });
});
