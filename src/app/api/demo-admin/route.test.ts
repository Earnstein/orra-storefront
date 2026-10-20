import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { session as sessions, user as users } from "@/db/schema";
import { createTestAuth } from "@/test/auth";

// The route runs against Better Auth and the database on one PGlite. Cookies are written by Better
// Auth's nextCookies plugin in the app (left out of the test instance), so this checks the session
// made, the count cookie, and the refusals.
const request = vi.hoisted(() => ({ auth: undefined as unknown, db: undefined as unknown, headers: new Headers(), jar: new Map<string, string>(), vercelEnv: undefined as string | undefined }));
vi.mock("@/lib/auth", () => ({
  get auth() {
    return request.auth;
  },
}));
vi.mock("@/db", () => ({
  get db() {
    return request.db;
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => request.headers,
  cookies: async () => ({ get: (name: string) => (request.jar.has(name) ? { value: request.jar.get(name) } : undefined), set: (name: string, value: string) => request.jar.set(name, value) }),
}));
vi.mock("@/lib/env", async (original) => ({
  ...(await original<typeof import("@/lib/env")>()),
  serverEnv: () => ({ BETTER_AUTH_SECRET: "s".repeat(32), BETTER_AUTH_URL: "http://localhost:3000", VERCEL_ENV: request.vercelEnv }),
}));

const { POST } = await import("./route");
const { DEMO_ADMIN_EMAIL, DEMO_SIGN_INS_PER_WINDOW } = await import("@/lib/admin/demo");
let t: Awaited<ReturnType<typeof createTestAuth>>;

beforeAll(async () => {
  t = await createTestAuth();
  request.auth = t.auth;
  request.db = t.db;
});

beforeEach(() => {
  request.jar = new Map();
  request.vercelEnv = undefined;
});

const post = (headers: Record<string, string> = { origin: "http://localhost:3000" }) =>
  POST(new Request("http://localhost:3000/api/demo-admin", { method: "POST", headers: { "user-agent": "test", ...headers } }));

describe("POST /api/demo-admin", () => {
  it("refuses another origin, and a request without one", async () => {
    expect((await post({ origin: "https://evil.example" })).status).toBe(403);
    expect((await post({})).status).toBe(403);
  });

  it("signs in as the demo account for 2 hours, privately, and sets the demo bag's count", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: true, redirect: "/admin/products" });
    const rows = await t.db.select().from(sessions).innerJoin(users, eq(sessions.userId, users.id));
    const demo = rows.filter((row) => row.user.email === DEMO_ADMIN_EMAIL);
    expect(demo).toHaveLength(1);
    const lifetime = demo[0]!.session.expiresAt.getTime() - demo[0]!.session.createdAt.getTime();
    expect(Math.round(lifetime / 60_000)).toBe(120);
    expect(request.jar.get("orra_bag_count")).toBe("0");
  });

  it("on Vercel, refuses a sixth sign-in from one address within 10 minutes", async () => {
    request.vercelEnv = "production";
    const from = { origin: "http://localhost:3000", "x-forwarded-for": "198.51.100.4, 10.0.0.1" };
    for (let i = 0; i < DEMO_SIGN_INS_PER_WINDOW; i++) expect((await post(from)).status).toBe(200);
    const refused = await post(from);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ ok: false, error: "rate-limited" });
    expect((await post({ ...from, "x-forwarded-for": "198.51.100.5" })).status).toBe(200);
  });
});
