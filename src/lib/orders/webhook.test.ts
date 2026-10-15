import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkouts, orders, paymentEvents, products } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { ensureCart } from "@/lib/bag/cart";
import { addLine } from "@/lib/bag/mutations";
import { startCheckoutWith } from "@/lib/checkout/start";
import { createFakeProvider, type FakeProvider } from "@/lib/payments/fake";
import type { PaymentEvent } from "@/lib/payments/types";
import { createTestDb } from "@/test/db";
import type { FulfilDeps } from "./fulfil";
import { handlePaymentWebhook } from "./webhook";

let db: SeedDatabase;
let fake: FakeProvider;
let deps: FulfilDeps;

beforeEach(async () => {
  db = await createTestDb();
  fake = createFakeProvider();
  deps = {
    db,
    transact: (fn) => db.transaction(fn),
    provider: fake.provider,
    baseUrl: "https://orra.test",
    secret: "s".repeat(32),
    send: async () => ({ ok: true }),
    defer: () => {},
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const stockOf = async (slug: string) => (await db.select({ stock: products.stock }).from(products).where(eq(products.slug, slug)))[0]!.stock;
const statusOf = async (id: string) => (await db.select({ status: checkouts.status }).from(checkouts).where(eq(checkouts.id, id)))[0]!.status;

async function hold(slug = "leather-tote-tan") {
  const { id: cartId } = await ensureCart(db, { userId: null, guestCartId: null });
  await addLine(db, cartId, slug, 1);
  const result = await startCheckoutWith(
    { db, transact: (fn) => db.transaction(fn), provider: () => fake.provider, rateLimit: false, baseUrl: "https://orra.test" },
    { cart: { userId: null, guestCartId: cartId }, email: "shopper@example.test", ip: null },
  );
  if (!result.ok) throw new Error(result.message);
  return { checkoutId: result.data.checkoutId, reference: `fake_${fake.started}` };
}

const deliver = (event: PaymentEvent, signature = "valid") =>
  handlePaymentWebhook(deps, JSON.stringify(event), new Headers({ "x-fake-signature": signature }));

describe("the payment webhook", () => {
  it("fulfils a completed payment once, and answers a repeated delivery without doing it again", async () => {
    const { checkoutId, reference } = await hold();
    fake.set(reference, { status: "authorised" });
    const event: PaymentEvent = { id: "evt_1", type: "payment.completed", reference, checkoutId };

    expect(await deliver(event)).toEqual({ status: 200, body: { received: true } });
    expect(await db.select().from(orders)).toHaveLength(1);
    expect(fake.payments.get(reference)?.settled).toBe(1);
    expect(await db.select().from(paymentEvents)).toEqual([expect.objectContaining({ id: "evt_1", provider: "fake" })]);

    const verify = vi.spyOn(fake.provider, "verify");
    expect(await deliver(event)).toEqual({ status: 200, body: { received: true } });
    expect(verify).not.toHaveBeenCalled();
    expect(await db.select().from(orders)).toHaveLength(1);
  });

  it("releases the hold when the payment expires", async () => {
    const before = await stockOf("leather-tote-tan");
    const { checkoutId, reference } = await hold();
    expect(await stockOf("leather-tote-tan")).toBe(before - 1);
    expect(await deliver({ id: "evt_2", type: "payment.expired", reference, checkoutId })).toMatchObject({ status: 200 });
    expect(await statusOf(checkoutId)).toBe("expired");
    expect(await stockOf("leather-tote-tan")).toBe(before);
  });

  it("refuses an unsigned or tampered delivery with 400 and changes nothing", async () => {
    const { checkoutId, reference } = await hold();
    fake.set(reference, { status: "authorised" });
    const event: PaymentEvent = { id: "evt_3", type: "payment.completed", reference, checkoutId };
    expect(await handlePaymentWebhook(deps, JSON.stringify(event), new Headers())).toMatchObject({ status: 400 });
    expect(await deliver(event, "forged")).toMatchObject({ status: 400 });
    expect(await db.select().from(orders)).toHaveLength(0);
    expect(await db.select().from(paymentEvents)).toHaveLength(0);
    expect(await statusOf(checkoutId)).toBe("open");
  });

  it("answers 500 when handling fails, leaving the event unrecorded so a retry handles it", async () => {
    const { checkoutId, reference } = await hold();
    fake.set(reference, { status: "authorised" });
    const event: PaymentEvent = { id: "evt_4", type: "payment.completed", reference, checkoutId };
    vi.spyOn(fake.provider, "verify").mockRejectedValueOnce(new Error("Stripe unavailable"));

    expect(await deliver(event)).toMatchObject({ status: 500 });
    expect(await db.select().from(paymentEvents)).toHaveLength(0);
    expect(await db.select().from(orders)).toHaveLength(0);

    expect(await deliver(event)).toMatchObject({ status: 200 });
    expect(await db.select().from(orders)).toHaveLength(1);
  });

  it("asks for a completed event again (500) while the payment still reads as pending", async () => {
    const { checkoutId, reference } = await hold();
    const event: PaymentEvent = { id: "evt_7", type: "payment.completed", reference, checkoutId };
    expect(await deliver(event)).toMatchObject({ status: 500 });
    expect(await db.select().from(paymentEvents)).toHaveLength(0);
    fake.set(reference, { status: "authorised" });
    expect(await deliver(event)).toMatchObject({ status: 200 });
    expect(await db.select().from(orders)).toHaveLength(1);
  });

  it("acknowledges events for payments it doesn't know, and events it doesn't use", async () => {
    expect(await deliver({ id: "evt_5", type: "payment.completed", reference: "fake_999", checkoutId: null })).toMatchObject({ status: 200 });
    const other = JSON.stringify({ id: "evt_6", type: "customer.created", reference: "x", checkoutId: null });
    expect(await handlePaymentWebhook(deps, other, new Headers({ "x-fake-signature": "valid" }))).toMatchObject({ status: 200 });
  });
});
