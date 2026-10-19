import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { orders, products } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { createFakeProvider, type FakeProvider } from "@/lib/payments/fake";
import { createTestDb } from "@/test/db";
import { placeOrder } from "@/test/orders";
import { cancelOrder, fulfilOrder } from "./mutations";

let db: SeedDatabase;
let fake: FakeProvider;

beforeEach(async () => {
  db = await createTestDb();
  fake = createFakeProvider();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const stockOf = async (slug: string) => (await db.select({ stock: products.stock }).from(products).where(eq(products.slug, slug)))[0]!.stock;
const orderRow = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0]!;
const deps = () => ({ db, provider: fake.provider });

describe("fulfilOrder", () => {
  it("marks a paid order fulfilled with the time", async () => {
    const { orderId } = await placeOrder(db, fake, { "leather-tote-tan": 1 });
    expect(await fulfilOrder(deps(), orderId)).toEqual({ ok: true, data: null });
    const row = await orderRow(orderId);
    expect(row.status).toBe("fulfilled");
    expect(row.fulfilledAt).toBeInstanceOf(Date);
  });

  it("refuses an order already fulfilled, a cancelled one and one still being captured", async () => {
    const { orderId } = await placeOrder(db, fake, { "leather-tote-tan": 1 });
    await fulfilOrder(deps(), orderId);
    expect(await fulfilOrder(deps(), orderId)).toMatchObject({ ok: false, error: "invalid", message: "This order is already fulfilled." });

    const cancelled = await placeOrder(db, fake, { "double-monk-shoe": 1 });
    await cancelOrder(deps(), cancelled.orderId);
    expect(await fulfilOrder(deps(), cancelled.orderId)).toMatchObject({ ok: false, error: "invalid", message: "A cancelled order can't be fulfilled." });

    const pending = await placeOrder(db, fake, { "round-sunglasses": 1 });
    await db.update(orders).set({ status: "pending_capture" }).where(eq(orders.id, pending.orderId));
    expect(await fulfilOrder(deps(), pending.orderId)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("answers not-found for an unknown order", async () => {
    expect(await fulfilOrder(deps(), "00000000-0000-4000-8000-000000000000")).toMatchObject({ ok: false, error: "not-found" });
  });
});

describe("cancelOrder", () => {
  it("refunds a paid order once, puts its stock back once and marks it cancelled and refunded", async () => {
    const { orderId, reference } = await placeOrder(db, fake, { "leather-tote-tan": 2, "double-monk-shoe": 1 });
    const tote = await stockOf("leather-tote-tan");
    const shoe = await stockOf("double-monk-shoe");

    expect(await cancelOrder(deps(), orderId)).toEqual({ ok: true, data: null });
    const row = await orderRow(orderId);
    expect(row.status).toBe("cancelled");
    expect(row.cancelledAt).toBeInstanceOf(Date);
    expect(row.refundedAt).toBeInstanceOf(Date);
    expect(fake.payments.get(reference)).toMatchObject({ undone: 1, status: "failed" });
    expect(await stockOf("leather-tote-tan")).toBe(tote + 2);
    expect(await stockOf("double-monk-shoe")).toBe(shoe + 1);

    // Again: refused, nothing moves.
    expect(await cancelOrder(deps(), orderId)).toMatchObject({ ok: false, error: "invalid", message: "This order is already cancelled." });
    expect(fake.payments.get(reference)!.undone).toBe(1);
    expect(await stockOf("leather-tote-tan")).toBe(tote + 2);
  });

  it("two cancels at once refund once and return the stock once", async () => {
    const { orderId, reference } = await placeOrder(db, fake, { "leather-tote-tan": 1 });
    const before = await stockOf("leather-tote-tan");
    const results = await Promise.all([cancelOrder(deps(), orderId), cancelOrder(deps(), orderId)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ error: "invalid" });
    expect(fake.payments.get(reference)!.undone).toBe(1);
    expect(await stockOf("leather-tote-tan")).toBe(before + 1);
  });

  it("leaves the order paid and the stock alone when the refund fails, and can be retried", async () => {
    const { orderId, reference } = await placeOrder(db, fake, { "leather-tote-tan": 1 });
    const before = await stockOf("leather-tote-tan");
    fake.failUndo(reference);

    expect(await cancelOrder(deps(), orderId)).toEqual({
      ok: false,
      error: "failed",
      message: "The refund didn't go through, so the order is still paid. Try again.",
    });
    const row = await orderRow(orderId);
    expect(row).toMatchObject({ status: "paid", cancelledAt: null, refundedAt: null });
    expect(await stockOf("leather-tote-tan")).toBe(before);

    fake.failUndo(reference, false);
    expect(await cancelOrder(deps(), orderId)).toMatchObject({ ok: true });
    expect(await stockOf("leather-tote-tan")).toBe(before + 1);
  });

  it("can't cancel a fulfilled order", async () => {
    const { orderId, reference } = await placeOrder(db, fake, { "leather-tote-tan": 1 });
    await fulfilOrder(deps(), orderId);
    expect(await cancelOrder(deps(), orderId)).toMatchObject({ ok: false, error: "invalid", message: "A fulfilled order can't be cancelled." });
    expect(fake.payments.get(reference)!.undone).toBe(0);
  });

  it("a fulfil while the refund is in flight is refused", async () => {
    const { orderId, reference } = await placeOrder(db, fake, { "leather-tote-tan": 1 });
    let fulfilDuringRefund: Awaited<ReturnType<typeof fulfilOrder>> | undefined;
    vi.spyOn(fake.provider, "undo").mockImplementationOnce(async () => {
      fulfilDuringRefund = await fulfilOrder(deps(), orderId);
      fake.set(reference, { status: "failed" });
    });
    expect(await cancelOrder(deps(), orderId)).toMatchObject({ ok: true });
    expect(fulfilDuringRefund).toMatchObject({ ok: false, error: "invalid", message: "This order is being cancelled." });
    expect((await orderRow(orderId)).status).toBe("cancelled");
  });

  it("a cancel cut off after its refund can't be fulfilled later; cancelling again finishes it, refunding once", async () => {
    const { orderId, reference } = await placeOrder(db, fake, { "leather-tote-tan": 1 });
    const before = await stockOf("leather-tote-tan");
    // The refund went through, then the function stopped before recording it; the claim lapsed.
    await fake.provider.undo(reference);
    await db.execute(sql`update orders set cancelled_at = now() - interval '11 minutes' where id = ${orderId}`);

    expect(await fulfilOrder(deps(), orderId)).toMatchObject({
      ok: false,
      error: "invalid",
      message: "A cancel of this order didn't finish. Cancel it again to complete the refund.",
    });
    expect(await cancelOrder(deps(), orderId)).toMatchObject({ ok: true });
    expect(fake.payments.get(reference)!.undone).toBe(1);
    expect((await orderRow(orderId)).status).toBe("cancelled");
    expect(await stockOf("leather-tote-tan")).toBe(before + 1);
  });

  it("finishes the cancel when the refund call fails but the refund was made", async () => {
    const { orderId, reference } = await placeOrder(db, fake, { "leather-tote-tan": 1 });
    vi.spyOn(fake.provider, "undo").mockImplementationOnce(async () => {
      fake.set(reference, { status: "failed" });
      throw new Error("timed out after the refund");
    });
    expect(await cancelOrder(deps(), orderId)).toMatchObject({ ok: true });
    expect(await orderRow(orderId)).toMatchObject({ status: "cancelled" });
  });

  it("keeps the claim when the refund can't be confirmed either way: no fulfil until it's cancelled again", async () => {
    const { orderId, reference } = await placeOrder(db, fake, { "leather-tote-tan": 1 });
    const before = await stockOf("leather-tote-tan");
    fake.failUndo(reference);
    vi.spyOn(fake.provider, "verify").mockRejectedValueOnce(new Error("provider unreachable"));
    expect(await cancelOrder(deps(), orderId)).toMatchObject({ ok: false, error: "failed", message: "We couldn't confirm the refund. Try cancelling again in 10 minutes." });
    expect(await orderRow(orderId)).toMatchObject({ status: "paid" });
    expect((await orderRow(orderId)).cancelledAt).toBeInstanceOf(Date);
    expect(await stockOf("leather-tote-tan")).toBe(before);
    expect(await fulfilOrder(deps(), orderId)).toMatchObject({ ok: false, message: "This order is being cancelled." });
  });
});
