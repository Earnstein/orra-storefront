import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { user as users } from "@/db/schema";
import { cookiesFrom, createTestAuth } from "@/test/auth";

const request = vi.hoisted(() => ({ auth: undefined as unknown, db: undefined as unknown, headers: new Headers() }));
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
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

const { GET } = await import("./route");
let t: Awaited<ReturnType<typeof createTestAuth>>;
let next = 0;

beforeAll(async () => {
  t = await createTestAuth();
  request.auth = t.auth;
  request.db = t.db;
});

beforeEach(() => {
  request.headers = new Headers();
});

async function signInAs(role: string) {
  const email = `table-${++next}@example.test`;
  const { user } = await t.auth.api.signUpEmail({ body: { name: "Ada", email, password: "correct-horse" } });
  await t.db.update(users).set({ role }).where(eq(users.id, user.id));
  const { headers } = await t.auth.api.signInEmail({ body: { email, password: "correct-horse" }, returnHeaders: true });
  request.headers = cookiesFrom(headers);
}

const get = (query = "") => GET(new Request(`http://localhost:3000/api/admin/products${query}`));

describe("GET /api/admin/products", () => {
  it("answers 401 signed out and 404 to shoppers", async () => {
    expect((await get()).status).toBe(401);
    await signInAs("user");
    expect((await get()).status).toBe(404);
  });

  it("serves the demo admin a private page of results", async () => {
    await signInAs("demo-admin");
    const response = await get("?q=tote&sort=price&dir=asc");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("server-timing")).toMatch(/^db;dur=\d+$/);
    const body = (await response.json()) as { rows: { name: string; price: number }[]; total: number };
    expect(body.total).toBeGreaterThan(0);
    expect(body.rows.map((r) => r.price)).toEqual(body.rows.map((r) => r.price).toSorted((a, b) => a - b));
  });
});
