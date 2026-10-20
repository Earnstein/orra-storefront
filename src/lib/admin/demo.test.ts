import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { account, session as sessions, user as users } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { DEMO_SESSION_SECONDS } from "@/lib/auth/demo-plugin";
import { cookiesFrom, createTestAuth } from "@/test/auth";
import { allowDemoSignIn, DEMO_ADMIN_EMAIL, DEMO_SIGN_INS_PER_WINDOW, DEMO_WINDOW_MS, ensureDemoAdmin } from "./demo";

// getCurrentSession (the server's session check) runs against the test instance.
const request = vi.hoisted(() => ({ auth: undefined as unknown, headers: new Headers() }));
vi.mock("@/lib/auth", () => ({
  get auth() {
    return request.auth;
  },
}));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

let t: Awaited<ReturnType<typeof createTestAuth>>;
let db: SeedDatabase;
let next = 0;

beforeAll(async () => {
  t = await createTestAuth();
  db = t.db;
  request.auth = t.auth;
});

async function signedIn(role = "user") {
  const email = `demo-${++next}@example.test`;
  const { user } = await t.auth.api.signUpEmail({ body: { name: "Ada", email, password: "correct-horse" } });
  await db.update(users).set({ role }).where(eq(users.id, user.id));
  const { headers } = await t.auth.api.signInEmail({ body: { email, password: "correct-horse" }, returnHeaders: true });
  return { userId: user.id, cookies: cookiesFrom(headers) };
}

/** Signs this browser in as the demo admin, as POST /api/demo-admin does. */
async function demoSignIn(requestHeaders = new Headers()) {
  const { id } = await ensureDemoAdmin(db);
  const { headers } = await t.auth.api.signInAsDemoAdmin({ body: { userId: id }, headers: requestHeaders, returnHeaders: true });
  return { id, setCookies: headers.getSetCookie(), cookies: cookiesFrom(headers) };
}

describe("ensureDemoAdmin", () => {
  it("creates the demo account once, with the demo role and no password, even when asked twice at once", async () => {
    const [a, b] = await Promise.all([ensureDemoAdmin(db), ensureDemoAdmin(db)]);
    expect(a.id).toBe(b.id);
    expect((await ensureDemoAdmin(db)).id).toBe(a.id);
    const rows = await db.select().from(users).where(eq(users.email, DEMO_ADMIN_EMAIL));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.role).toBe("demo-admin");
    // No credential: nobody can sign in to it with a password, or delete it (which needs one).
    expect(await db.select().from(account).where(eq(account.userId, a.id))).toEqual([]);
  });

  it("takes back an account someone registered at the demo address: no password, no sessions, the demo's name", async () => {
    const fresh = await createTestAuth();
    const email = "taken@example.test";
    const { user } = await fresh.auth.api.signUpEmail({ body: { name: "Mallory", email, password: "correct-horse" } });
    await fresh.db.update(users).set({ email: DEMO_ADMIN_EMAIL }).where(eq(users.id, user.id));
    const { id } = await ensureDemoAdmin(fresh.db);
    expect(id).toBe(user.id);
    expect((await fresh.db.select().from(users).where(eq(users.id, id)))[0]).toMatchObject({ name: "Demo admin", role: "demo-admin" });
    expect(await fresh.db.select().from(account).where(eq(account.userId, id))).toEqual([]);
    expect(await fresh.db.select().from(sessions).where(eq(sessions.userId, id))).toEqual([]);
    await expect(fresh.auth.api.signInEmail({ body: { email: DEMO_ADMIN_EMAIL, password: "correct-horse" } })).rejects.toMatchObject({ statusCode: 401 });
  });

  it("puts the demo role back if it was changed", async () => {
    const { id } = await ensureDemoAdmin(db);
    await db.update(users).set({ role: "user" }).where(eq(users.id, id));
    await ensureDemoAdmin(db);
    expect((await db.select({ role: users.role }).from(users).where(eq(users.id, id)))[0]!.role).toBe("demo-admin");
  });
});

describe("allowDemoSignIn", () => {
  it("allows 5 per IP in 10 minutes, then refuses until the window has passed; other IPs are counted apart", async () => {
    const now = Date.UTC(2026, 9, 20, 12);
    for (let i = 0; i < DEMO_SIGN_INS_PER_WINDOW; i++) expect(await allowDemoSignIn(db, "203.0.113.7", now + i)).toBe(true);
    expect(await allowDemoSignIn(db, "203.0.113.7", now + 10)).toBe(false);
    expect(await allowDemoSignIn(db, "203.0.113.8", now + 10)).toBe(true);
    expect(await allowDemoSignIn(db, "203.0.113.7", now + DEMO_WINDOW_MS + 1)).toBe(true);
  });
});

describe("signing in as the demo admin", () => {
  it("makes a 2-hour, browser-session sign-in as the demo account", async () => {
    const before = Date.now();
    const { id, setCookies, cookies } = await demoSignIn();
    const session = await t.auth.api.getSession({ headers: cookies, query: { disableCookieCache: true } });
    expect(session?.user).toMatchObject({ id, email: DEMO_ADMIN_EMAIL, role: "demo-admin" });
    const expiresAt = new Date(session!.session.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + DEMO_SESSION_SECONDS * 1000 - 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + DEMO_SESSION_SECONDS * 1000);
    // The session cookie ends with the browser session, and marks it not to be remembered.
    const token = setCookies.find((line) => line.startsWith("better-auth.session_token="))!;
    expect(token).not.toMatch(/Max-Age/i);
    expect(setCookies.some((line) => line.startsWith("better-auth.dont_remember="))).toBe(true);
  });

  it("is never extended by use while the browser sends its dont_remember cookie", async () => {
    const { cookies } = await demoSignIn();
    const first = await t.auth.api.getSession({ headers: cookies, query: { disableCookieCache: true } });
    // A 2-hour session is always past Better Auth's refresh point (30 days less a day); it's skipped
    // only because the session isn't remembered.
    await t.auth.api.getSession({ headers: cookies, query: { disableCookieCache: true } });
    const [row] = await db.select({ expiresAt: sessions.expiresAt }).from(sessions).where(eq(sessions.token, first!.session.token));
    expect(row!.expiresAt.getTime()).toBe(new Date(first!.session.expiresAt).getTime());
  });

  it("ends 2 hours after sign-in on the server, even without that cookie (which Better Auth would let extend it)", async () => {
    const { getCurrentSession } = await import("@/lib/auth/session");
    const { cookies } = await demoSignIn();
    const withoutDontRemember = new Headers({ cookie: cookies.get("cookie")!.split("; ").filter((pair) => !pair.startsWith("better-auth.dont_remember=")).join("; ") });
    const token = (await t.auth.api.getSession({ headers: cookies, query: { disableCookieCache: true } }))!.session.token;

    request.headers = withoutDontRemember;
    expect((await getCurrentSession())?.role).toBe("demo-admin");
    // Better Auth's session times are timestamps without a zone, written from JS dates (UTC).
    await db.update(sessions).set({ createdAt: new Date(Date.now() - (2 * 60 + 1) * 60_000) }).where(eq(sessions.token, token));
    // A new request: getCurrentSession is deduplicated per request (React's cache), so load it afresh.
    vi.resetModules();
    const later = (await import("@/lib/auth/session")).getCurrentSession;
    expect(await later()).toBeNull();
    // Deleted, so Better Auth's own reads (the header's) see it signed out too.
    expect(await db.select().from(sessions).where(eq(sessions.token, token))).toEqual([]);
  });

  it("can be started again from a demo session", async () => {
    const first = await demoSignIn();
    const again = await demoSignIn(first.cookies);
    expect((await t.auth.api.getSession({ headers: again.cookies, query: { disableCookieCache: true } }))?.user.email).toBe(DEMO_ADMIN_EMAIL);
  });

  it("ends the visitor's own session first", async () => {
    const own = await signedIn();
    const mine = await t.auth.api.getSession({ headers: own.cookies, query: { disableCookieCache: true } });
    const { cookies } = await demoSignIn(own.cookies);
    // (Signing up made a session of its own too; only this browser's is ended.)
    expect(await db.select().from(sessions).where(eq(sessions.token, mine!.session.token))).toEqual([]);
    expect(await t.auth.api.getSession({ headers: own.cookies, query: { disableCookieCache: true } })).toBeNull();
    expect((await t.auth.api.getSession({ headers: cookies, query: { disableCookieCache: true } }))?.user.email).toBe(DEMO_ADMIN_EMAIL);
  });

  it("refuses any account that isn't the demo admin", async () => {
    const owner = await signedIn("admin");
    await expect(t.auth.api.signInAsDemoAdmin({ body: { userId: owner.userId }, headers: new Headers() })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("the shared demo account can't be changed or locked from a demo session", () => {
  it("refuses the demo session every Better Auth endpoint but reading and ending its own session and signing in", async () => {
    const { cookies } = await demoSignIn();
    const other = await demoSignIn();
    const allowed = new Set(["/get-session", "/sign-out", "/sign-in/email", "/sign-up/email", "/request-password-reset", "/reset-password", "/reset-password/:token", "/ok", "/error"]);
    const endpoints = Object.values(t.auth.api as Record<string, { path?: string; options?: { method?: string | string[]; metadata?: { SERVER_ONLY?: boolean } } }>).filter(
      (endpoint) => endpoint.path && !endpoint.options?.metadata?.SERVER_ONLY,
    );
    expect(endpoints.length).toBeGreaterThan(30);
    const refusedPaths: string[] = [];
    for (const endpoint of endpoints) {
      if (allowed.has(endpoint.path!)) continue;
      const method = [endpoint.options?.method ?? "GET"].flat()[0]!;
      const methodName = method === "*" ? "POST" : method;
      const url = `http://localhost:3000/api/auth${endpoint.path!.replace(/:[a-zA-Z]+/g, "x")}`;
      const response = await t.auth.handler(
        new Request(url, {
          method: methodName,
          headers: { ...Object.fromEntries(cookies), "content-type": "application/json", origin: "http://localhost:3000" },
          // A password, so endpoints that ask for one (delete-user) reach the demo check.
          body: methodName === "GET" ? undefined : JSON.stringify({ password: "correct-horse" }),
        }),
      );
      if (response.status !== 403) refusedPaths.push(`${methodName} ${endpoint.path} → ${response.status}`);
    }
    expect(refusedPaths).toEqual([]);
    // Nothing ended the other demo visitor's session.
    expect((await t.auth.api.getSession({ headers: other.cookies, query: { disableCookieCache: true } }))?.user.email).toBe(DEMO_ADMIN_EMAIL);
  });

  it("lets a normal account use them", async () => {
    const own = await signedIn();
    await expect(t.auth.api.updateUser({ body: { name: "Grace" }, headers: own.cookies })).resolves.toMatchObject({ status: true });
  });

  it("refuses a sign-up at the demo account's reserved domain", async () => {
    await expect(t.auth.api.signUpEmail({ body: { name: "Mallory", email: "someone@orra.invalid", password: "correct-horse" } })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
