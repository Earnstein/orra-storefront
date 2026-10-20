import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { orders } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { createFakeProvider } from "@/lib/payments/fake";
import { createTestDb } from "@/test/db";
import { placeOrder } from "@/test/orders";
import { cancelOrder, fulfilOrder } from "./mutations";
import { getAdminOrder, listAdminOrders } from "./queries";

let db: SeedDatabase;
let placed: { orderId: string; number: string }[];

beforeAll(async () => {
  db = await createTestDb();
  const fake = createFakeProvider();
  placed = [];
  placed.push(await placeOrder(db, fake, { "leather-tote-tan": 2 }, { email: "ada@example.test" }));
  placed.push(await placeOrder(db, fake, { "double-monk-shoe": 1, "round-sunglasses": 1 }, { email: "grace@example.test", shipping: { name: "Grace Hopper", line1: "2 Navy Way", line2: null, city: "Arlington", state: "VA", postalCode: "22201", country: "US" } }));
  placed.push(await placeOrder(db, fake, { "leather-tote-tan": 1 }, { email: "ada@example.test" }));
  await fulfilOrder({ db }, placed[1]!.orderId);
  await cancelOrder({ db, provider: fake.provider }, placed[2]!.orderId);
});

const params = (change: Partial<{ q: string; status: "all" | "paid" | "fulfilled" | "cancelled" | "pending_capture"; page: number }> = {}) => ({ q: "", status: "all" as const, page: 1, ...change });

describe("listAdminOrders", () => {
  it("lists every order newest first with customer, status, total and item count", async () => {
    const { rows, total, page } = await listAdminOrders(db, params(), { masked: false });
    expect(total).toBe(3);
    expect(page).toBe(1);
    expect(rows.map((row) => row.number)).toEqual(["ORR-10003", "ORR-10002", "ORR-10001"]);
    expect(rows[1]).toMatchObject({ name: "Grace Hopper", email: "grace@example.test", status: "fulfilled", itemCount: 2 });
    expect(rows[2]).toMatchObject({ status: "paid", itemCount: 2 });
    expect(rows[0]!.status).toBe("cancelled");
    expect(new Date(rows[0]!.createdAt).toISOString()).toBe(rows[0]!.createdAt);
  });

  it("filters by status and searches by number or email", async () => {
    expect((await listAdminOrders(db, params({ status: "fulfilled" }), { masked: false })).rows.map((r) => r.number)).toEqual(["ORR-10002"]);
    expect((await listAdminOrders(db, params({ q: "orr-10001" }), { masked: false })).rows.map((r) => r.number)).toEqual(["ORR-10001"]);
    expect((await listAdminOrders(db, params({ q: "10002" }), { masked: false })).total).toBe(1);
    expect((await listAdminOrders(db, params({ q: "ADA@" }), { masked: false })).total).toBe(2);
    expect((await listAdminOrders(db, params({ q: "%" }), { masked: false })).total).toBe(0);
  });

  it("masks names and emails for the demo admin, who can't search by email", async () => {
    const { rows } = await listAdminOrders(db, params(), { masked: true });
    expect(rows[1]).toMatchObject({ name: "G. H.", email: "•••@example.test" });
    expect(JSON.stringify(rows)).not.toMatch(/Hopper|grace@|ada@/);
    expect((await listAdminOrders(db, params({ q: "ada@example.test" }), { masked: true })).total).toBe(0);
    expect((await listAdminOrders(db, params({ q: "ORR-10001" }), { masked: true })).total).toBe(1);
  });

  it("clamps a page past the end", async () => {
    expect((await listAdminOrders(db, params({ page: 9 }), { masked: false })).page).toBe(1);
  });
});

describe("getAdminOrder", () => {
  it("reads an order in full for the owner, with its history", async () => {
    const order = await getAdminOrder(db, 10002, { masked: false });
    expect(order).toMatchObject({
      number: "ORR-10002",
      status: "fulfilled",
      masked: false,
      email: "grace@example.test",
      shipping: { name: "Grace Hopper", line1: "2 Navy Way", postalCode: "22201" },
      paymentSummary: "Visa ending 4242",
      cancelledAt: null,
      refunded: false,
      account: false,
    });
    expect(order!.fulfilledAt).not.toBeNull();
    expect(order!.items).toHaveLength(2);

    const cancelled = await getAdminOrder(db, 10003, { masked: false });
    expect(cancelled).toMatchObject({ status: "cancelled", refunded: true, cancelling: false });
    expect(cancelled!.cancelledAt).not.toBeNull();
  });

  it("masks it for the demo admin", async () => {
    const order = await getAdminOrder(db, 10002, { masked: true });
    expect(order).toMatchObject({ masked: true, email: "•••@example.test", shipping: { name: "G. H.", city: "Arlington", state: "VA" } });
    expect(JSON.stringify(order)).not.toMatch(/Hopper|Navy|22201|grace@/);
  });

  it("reports a cancel in progress and answers null for an unknown number", async () => {
    await db.update(orders).set({ cancelledAt: new Date() }).where(eq(orders.id, placed[0]!.orderId));
    expect(await getAdminOrder(db, 10001, { masked: false })).toMatchObject({ status: "paid", cancelling: true, cancelledAt: null });
    await db.update(orders).set({ cancelledAt: new Date(Date.now() - 11 * 60_000) }).where(eq(orders.id, placed[0]!.orderId));
    expect(await getAdminOrder(db, 10001, { masked: false })).toMatchObject({ status: "paid", cancelling: false, cancelCutOff: true });
    await db.update(orders).set({ cancelledAt: null }).where(eq(orders.id, placed[0]!.orderId));
    expect(await getAdminOrder(db, 99999, { masked: false })).toBeNull();
  });
});
