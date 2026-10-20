import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { orders, user as users } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { createFakeProvider } from "@/lib/payments/fake";
import { cookiesFrom, createTestAuth } from "@/test/auth";
import { placeOrder } from "@/test/orders";

// The actions run against Better Auth and the orders on one PGlite, with the fake payment
// provider; Next's request scope is stood in for, and updateTag/refresh are spies.
const request = vi.hoisted(() => ({ auth: undefined as unknown, db: undefined as unknown, headers: new Headers(), provider: undefined as unknown }));
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
vi.mock("@/lib/payments", () => ({ paymentProvider: () => request.provider }));
const cache = vi.hoisted(() => ({ updateTag: vi.fn(), refresh: vi.fn() }));
vi.mock("next/cache", () => ({ ...cache, cacheTag: () => {}, cacheLife: () => {} }));

const { cancelAdminOrder, fulfilAdminOrder } = await import("./actions");

let t: Awaited<ReturnType<typeof createTestAuth>>;
let db: SeedDatabase;
let fake: ReturnType<typeof createFakeProvider>;
let next = 0;

beforeAll(async () => {
  t = await createTestAuth();
  db = t.db;
  fake = createFakeProvider();
  request.auth = t.auth;
  request.db = db;
  request.provider = fake.provider;
});

beforeEach(() => {
  request.headers = new Headers();
  cache.updateTag.mockClear();
  cache.refresh.mockClear();
});

async function signInAs(role: string) {
  const email = `order-actions-${++next}@example.test`;
  const { user } = await t.auth.api.signUpEmail({ body: { name: "Ada", email, password: "correct-horse" } });
  await db.update(users).set({ role }).where(eq(users.id, user.id));
  const { headers } = await t.auth.api.signInEmail({ body: { email, password: "correct-horse" }, returnHeaders: true });
  request.headers = cookiesFrom(headers);
}

const statusOf = async (id: string) => (await db.select({ status: orders.status }).from(orders).where(eq(orders.id, id)))[0]!.status;

describe("order actions", () => {
  it("refuse a signed-out visitor, a shopper and the demo admin, changing nothing", async () => {
    const { orderId, reference } = await placeOrder(db, fake, { "leather-tote-tan": 1 });
    expect(await fulfilAdminOrder(orderId)).toMatchObject({ ok: false, error: "signed-out" });
    for (const role of ["user", "demo-admin"]) {
      await signInAs(role);
      expect(await fulfilAdminOrder(orderId)).toMatchObject({ ok: false, error: "forbidden" });
      expect(await cancelAdminOrder(orderId)).toMatchObject({ ok: false, error: "forbidden" });
    }
    expect(await statusOf(orderId)).toBe("paid");
    expect(fake.payments.get(reference)!.undone).toBe(0);
  });

  it("let the owner fulfil one order and cancel another, refreshing the page (and the catalogue on cancel)", async () => {
    const first = await placeOrder(db, fake, { "leather-tote-tan": 1 });
    const second = await placeOrder(db, fake, { "double-monk-shoe": 1 });
    await signInAs("admin");

    expect(await fulfilAdminOrder(first.orderId)).toEqual({ ok: true, data: null });
    expect(await statusOf(first.orderId)).toBe("fulfilled");
    expect(cache.refresh).toHaveBeenCalledTimes(1);
    expect(cache.updateTag).not.toHaveBeenCalled();

    expect(await cancelAdminOrder(second.orderId)).toEqual({ ok: true, data: null });
    expect(await statusOf(second.orderId)).toBe("cancelled");
    expect(cache.updateTag).toHaveBeenCalledWith("catalog");
    expect(cache.refresh).toHaveBeenCalledTimes(2);
  });

  it("answer not-found for a malformed id, and refresh nothing on a refusal", async () => {
    await signInAs("admin");
    expect(await fulfilAdminOrder("not-an-id")).toMatchObject({ ok: false, error: "not-found" });
    const { orderId } = await placeOrder(db, fake, { "round-sunglasses": 1 });
    await fulfilAdminOrder(orderId);
    cache.refresh.mockClear();
    expect(await cancelAdminOrder(orderId)).toMatchObject({ ok: false, error: "invalid" });
    expect(cache.refresh).not.toHaveBeenCalled();
  });
});
