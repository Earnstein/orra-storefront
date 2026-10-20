import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { user as users } from "@/db/schema";
import { createFakeProvider } from "@/lib/payments/fake";
import { cookiesFrom, createTestAuth } from "@/test/auth";
import { placeOrder } from "@/test/orders";

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
  await placeOrder(t.db, createFakeProvider(), { "leather-tote-tan": 1 }, { email: "ada@example.test" });
});

beforeEach(() => {
  request.headers = new Headers();
});

async function signInAs(role: string) {
  const email = `orders-${++next}@example.test`;
  const { user } = await t.auth.api.signUpEmail({ body: { name: "Ada", email, password: "correct-horse" } });
  await t.db.update(users).set({ role }).where(eq(users.id, user.id));
  const { headers } = await t.auth.api.signInEmail({ body: { email, password: "correct-horse" }, returnHeaders: true });
  request.headers = cookiesFrom(headers);
}

const get = (query = "") => GET(new Request(`http://localhost:3000/api/admin/orders${query}`));
type Body = { rows: { number: string; name: string | null; email: string }[]; total: number };

describe("GET /api/admin/orders", () => {
  it("answers 401 signed out and 404 to shoppers", async () => {
    expect((await get()).status).toBe(401);
    await signInAs("user");
    expect((await get()).status).toBe(404);
  });

  it("serves the owner the orders in full, privately", async () => {
    await signInAs("admin");
    const response = await get("?status=paid");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("server-timing")).toMatch(/^db;dur=\d+$/);
    const body = (await response.json()) as Body;
    expect(body.rows).toEqual([expect.objectContaining({ number: "ORR-10001", name: "Ada Lovelace", email: "ada@example.test" })]);
  });

  it("masks them for the demo admin", async () => {
    await signInAs("demo-admin");
    const body = (await (await get()).json()) as Body;
    expect(body.rows).toEqual([expect.objectContaining({ number: "ORR-10001", name: "A. L.", email: "•••@example.test" })]);
    expect(((await (await get("?q=ada@example.test")).json()) as Body).total).toBe(0);
  });
});
