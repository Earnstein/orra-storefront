import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { account, session as sessions, user as users } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { DEMO_SESSION_SECONDS } from "@/lib/auth/demo-plugin";
import { cookiesFrom, createTestAuth } from "@/test/auth";
import { allowDemoSignIn, DEMO_ADMIN_EMAIL, DEMO_SIGN_INS_PER_WINDOW, DEMO_WINDOW_MS, ensureDemoAdmin } from "./demo";

let t: Awaited<ReturnType<typeof createTestAuth>>;
let db: SeedDatabase;
let next = 0;

beforeAll(async () => {
  t = await createTestAuth();
  db = t.db;
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

  it("is never extended by use (Better Auth refreshes a remembered session to 30 days)", async () => {
    const { cookies } = await demoSignIn();
    const first = await t.auth.api.getSession({ headers: cookies, query: { disableCookieCache: true } });
    // Make it old enough that a remembered session would be refreshed.
    await db.execute(sql`update session set created_at = now() - interval '1 day 1 hour' where token = ${first!.session.token}`);
    await t.auth.api.getSession({ headers: cookies, query: { disableCookieCache: true } });
    const [row] = await db.select({ expiresAt: sessions.expiresAt }).from(sessions).where(eq(sessions.token, first!.session.token));
    expect(row!.expiresAt.getTime()).toBe(new Date(first!.session.expiresAt).getTime());
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
  it("refuses renaming, password and session endpoints for the demo admin", async () => {
    const { cookies } = await demoSignIn();
    const other = await demoSignIn();
    const refused = (call: Promise<unknown>) => expect(call).rejects.toMatchObject({ statusCode: 403 });
    await refused(t.auth.api.updateUser({ body: { name: "Someone else" }, headers: cookies }));
    await refused(t.auth.api.changePassword({ body: { currentPassword: "x".repeat(8), newPassword: "y".repeat(8) }, headers: cookies }));
    await refused(t.auth.api.revokeOtherSessions({ headers: cookies }));
    await refused(t.auth.api.revokeSessions({ headers: cookies }));
    await refused(t.auth.api.listSessions({ headers: cookies }));
    // The other demo visitor is still signed in.
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
