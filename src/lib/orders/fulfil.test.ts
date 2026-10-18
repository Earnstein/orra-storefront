import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cartItems, checkouts, orderItems, orders, products } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { ensureCart } from "@/lib/bag/cart";
import { addLine } from "@/lib/bag/mutations";
import { releaseHold } from "@/lib/checkout/holds";
import { startCheckoutWith } from "@/lib/checkout/start";
import type { Email, SendOptions } from "@/lib/email/send";
import { createFakeProvider, type FakeProvider } from "@/lib/payments/fake";
import { createTestDb } from "@/test/db";
import { fulfil, type FulfilDeps } from "./fulfil";
import { guestKeyMatches, guestOrderKey } from "./guest-key";

let db: SeedDatabase;
let fake: FakeProvider;
let deps: FulfilDeps;
let deferred: Promise<void>[];
let sent: { email: Email; options: SendOptions }[];
let sendOk: boolean;

const SHIPPING = { name: "Ada Lovelace", line1: "1 Main St", line2: null, city: "Springfield", state: "IL", postalCode: "62701", country: "US" };

beforeEach(async () => {
  db = await createTestDb();
  fake = createFakeProvider();
  deferred = [];
  sent = [];
  sendOk = true;
  deps = {
    db,
    transact: (fn) => db.transaction(fn),
    provider: fake.provider,
    baseUrl: "https://orra.test",
    secret: "s".repeat(32),
    send: async (email, options) => {
      sent.push({ email, options });
      return { ok: sendOk };
    },
    defer: (task) => {
      deferred.push(task());
    },
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

/** Lets the deferred email work finish, as after() would once the response is sent. */
const settleDeferred = async () => {
  while (deferred.length > 0) await Promise.all(deferred.splice(0));
};

const product = async (slug: string) =>
  (await db.select({ id: products.id, name: products.name, price: products.price, stock: products.stock, images: products.images }).from(products).where(eq(products.slug, slug)))[0]!;
const stockOf = async (slug: string) => (await product(slug)).stock;
const setStock = (slug: string, stock: number) => db.update(products).set({ stock }).where(eq(products.slug, slug));
const statusOf = async (id: string) => (await db.select({ status: checkouts.status }).from(checkouts).where(eq(checkouts.id, id)))[0]!.status;
const allOrders = () => db.select().from(orders);

/** A guest's bag held at checkout, with its payment authorised (as Stripe would after Pay). */
async function paidHold(lines: Record<string, number>, { authorise = true, userId = null as string | null } = {}) {
  const { id: cartId } = await ensureCart(db, { userId, guestCartId: null });
  for (const [slug, quantity] of Object.entries(lines)) await addLine(db, cartId, slug, quantity);
  const result = await startCheckoutWith(
    { db, transact: (fn) => db.transaction(fn), provider: () => fake.provider, rateLimit: false, baseUrl: "https://orra.test" },
    { cart: { userId, guestCartId: userId ? null : cartId }, email: "shopper@example.test", ip: null },
  );
  if (!result.ok) throw new Error(result.message);
  const reference = `fake_${fake.started}`;
  if (authorise) fake.set(reference, { status: "authorised", summary: "Visa ending 4242", shipping: SHIPPING });
  return { cartId, checkoutId: result.data.checkoutId, reference };
}

/** The next capture finds the payment can no longer be taken (the authorisation lapsed). */
function lapseAtCapture(reference: string) {
  vi.spyOn(fake.provider, "settle").mockImplementationOnce(async () => {
    fake.set(reference, { status: "failed" });
    throw new Error("the authorisation expired");
  });
}

/** Makes a hold lapse and be swept (its stock returned), as if the shopper paid at the last second. */
async function lapse(checkoutId: string) {
  await db.update(checkouts).set({ expiresAt: new Date(Date.now() - 10 * 60_000) }).where(eq(checkouts.id, checkoutId));
  expect(await releaseHold(db, checkoutId)).toBe(true);
}

describe("fulfil", () => {
  it("turns an authorised hold into one paid order: lines copied with today's images, money captured, the hold fulfilled, the bought lines out of the bag", async () => {
    const tote = await product("leather-tote-tan");
    const shoe = await product("double-monk-shoe");
    const { cartId, checkoutId, reference } = await paidHold({ "leather-tote-tan": 2, "double-monk-shoe": 1 });
    const toteHeld = await stockOf("leather-tote-tan");

    const result = await fulfil(deps, checkoutId);
    if (result.status !== "confirmed") throw new Error(result.status);
    const { order } = result;

    expect(order).toMatchObject({
      number: "ORR-10001",
      checkoutId,
      userId: null,
      email: "shopper@example.test",
      status: "paid",
      subtotal: tote.price * 2 + shoe.price,
      currency: "USD",
      shipping: SHIPPING,
      paymentReference: reference,
      paymentSummary: "Visa ending 4242",
    });
    expect(order.items).toEqual(
      expect.arrayContaining([
        { productId: tote.id, name: tote.name, unitPrice: tote.price, quantity: 2, image: tote.images[0] },
        { productId: shoe.id, name: shoe.name, unitPrice: shoe.price, quantity: 1, image: shoe.images[0] },
      ]),
    );
    expect(order.items).toHaveLength(2);
    expect(fake.payments.get(reference)).toMatchObject({ status: "paid", settled: 1, undone: 0 });
    expect(await statusOf(checkoutId)).toBe("fulfilled");
    // The stock was taken by the hold; the order doesn't take it twice.
    expect(await stockOf("leather-tote-tan")).toBe(toteHeld);
    expect(await db.select().from(cartItems).where(eq(cartItems.cartId, cartId))).toEqual([]);

    // A guest's order carries a key for its link; only the hash is stored.
    const [row] = await allOrders();
    expect(guestKeyMatches(guestOrderKey(deps.secret, row!.id), row!.guestKeyHash)).toBe(true);
    expect(guestKeyMatches("wrong", row!.guestKeyHash)).toBe(false);
  });

  it("numbers orders from ORR-10001 upwards", async () => {
    const first = await paidHold({ "leather-tote-tan": 1 });
    const second = await paidHold({ "double-monk-shoe": 1 });
    const a = await fulfil(deps, first.checkoutId);
    const b = await fulfil(deps, second.checkoutId);
    expect(a.status === "confirmed" && a.order.number).toBe("ORR-10001");
    expect(b.status === "confirmed" && b.order.number).toBe("ORR-10002");
  });

  it("only takes what was bought out of the bag, leaving more added since", async () => {
    const { cartId, checkoutId } = await paidHold({ "leather-tote-tan": 1 });
    // Another tab added one more after the hold.
    await db.update(cartItems).set({ quantity: 3 }).where(eq(cartItems.cartId, cartId));
    await fulfil(deps, checkoutId);
    expect((await db.select({ quantity: cartItems.quantity }).from(cartItems).where(eq(cartItems.cartId, cartId)))[0]?.quantity).toBe(2);
  });

  it("makes one order and captures once when called twice at the same moment, and again later", async () => {
    const { checkoutId, reference } = await paidHold({ "leather-tote-tan": 1 });
    const results = await Promise.all([fulfil(deps, checkoutId), fulfil(deps, checkoutId)]);
    expect(results.map((r) => r.status)).toEqual(["confirmed", "confirmed"]);
    expect(await fulfil(deps, checkoutId)).toMatchObject({ status: "confirmed", order: { number: "ORR-10001" } });
    expect(await allOrders()).toHaveLength(1);
    expect(fake.payments.get(reference)?.settled).toBe(1);
  });

  it("takes a lapsed hold's stock again when it's still there, and makes the order", async () => {
    const { checkoutId } = await paidHold({ "leather-tote-tan": 1 });
    const held = await stockOf("leather-tote-tan");
    await lapse(checkoutId);
    expect(await stockOf("leather-tote-tan")).toBe(held + 1);

    expect(await fulfil(deps, checkoutId)).toMatchObject({ status: "confirmed" });
    expect(await stockOf("leather-tote-tan")).toBe(held);
    expect(await statusOf(checkoutId)).toBe("fulfilled");
  });

  it("still fulfils a hold whose product was archived after the shopper paid", async () => {
    const { checkoutId } = await paidHold({ "leather-tote-tan": 1 });
    await db.update(products).set({ archivedAt: new Date() }).where(eq(products.slug, "leather-tote-tan"));
    expect(await fulfil(deps, checkoutId)).toMatchObject({ status: "confirmed" });
    expect(await statusOf(checkoutId)).toBe("fulfilled");
  });

  it("an open hold that ran out but wasn't swept still holds its stock, so it becomes the order as it is", async () => {
    const { checkoutId } = await paidHold({ "leather-tote-tan": 1 });
    const held = await stockOf("leather-tote-tan");
    await db.update(checkouts).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(checkouts.id, checkoutId));
    expect(await fulfil(deps, checkoutId)).toMatchObject({ status: "confirmed" });
    expect(await stockOf("leather-tote-tan")).toBe(held);
  });

  it("cancels a lapsed hold whose stock sold elsewhere: no order, the authorisation undone once, the sold-out names", async () => {
    const shoe = await product("double-monk-shoe");
    const tote = await product("leather-tote-tan");
    const { checkoutId, reference } = await paidHold({ "double-monk-shoe": 1, "leather-tote-tan": 1 });
    await lapse(checkoutId);
    await setStock("double-monk-shoe", 0);
    const toteStock = await stockOf("leather-tote-tan");

    expect(await fulfil(deps, checkoutId)).toEqual({ status: "sold-out", items: [shoe.name] });
    expect(await allOrders()).toHaveLength(0);
    expect(await statusOf(checkoutId)).toBe("cancelled");
    expect(fake.payments.get(reference)).toMatchObject({ undone: 1, settled: 0 });
    // All or nothing: the tote's stock wasn't taken either.
    expect(await stockOf("leather-tote-tan")).toBe(toteStock);
    expect(await stockOf("double-monk-shoe")).toBe(0);

    // A later call answers the same and doesn't undo again (it's no longer authorised).
    expect(await fulfil(deps, checkoutId)).toEqual({ status: "sold-out", items: [shoe.name] });
    expect(fake.payments.get(reference)?.undone).toBe(1);
    expect(tote.stock).toBeGreaterThan(0);
  });

  it("throws when the undo of a cancelled checkout fails, and repeats it on the next call while the payment is still authorised", async () => {
    const { checkoutId, reference } = await paidHold({ "double-monk-shoe": 1 });
    await lapse(checkoutId);
    await setStock("double-monk-shoe", 0);
    fake.failUndo(reference);
    // Throwing makes the webhook answer 500, so Stripe redelivers.
    await expect(fulfil(deps, checkoutId)).rejects.toThrow("undo failed");
    expect(await statusOf(checkoutId)).toBe("cancelled");
    expect(fake.payments.get(reference)).toMatchObject({ status: "authorised", undone: 0 });

    fake.failUndo(reference, false);
    expect(await fulfil(deps, checkoutId)).toMatchObject({ status: "sold-out" });
    expect(fake.payments.get(reference)).toMatchObject({ status: "failed", undone: 1 });
  });

  it("leaves the order pending_capture and throws when the capture fails but the money can still be taken; the next call captures", async () => {
    const { checkoutId, reference } = await paidHold({ "leather-tote-tan": 2 });
    const held = await stockOf("leather-tote-tan");
    fake.failSettle(reference);

    await expect(fulfil(deps, checkoutId)).rejects.toThrow("not finished");
    expect((await allOrders())[0]?.status).toBe("pending_capture");
    expect(await stockOf("leather-tote-tan")).toBe(held);
    expect(fake.payments.get(reference)).toMatchObject({ status: "authorised", undone: 0 });

    // The provider can't be reached to check either: still not "not charged".
    vi.spyOn(fake.provider, "verify").mockRejectedValueOnce(new Error("Stripe unreachable"));
    await expect(fulfil(deps, checkoutId)).rejects.toThrow();
    expect((await allOrders())[0]?.status).toBe("pending_capture");

    fake.failSettle(reference, false);
    expect(await fulfil(deps, checkoutId)).toMatchObject({ status: "confirmed", order: { status: "paid" } });
    expect(fake.payments.get(reference)?.settled).toBe(1);
    expect(await allOrders()).toHaveLength(1);
  });

  it("marks the order paid when the capture call fails but the money was taken (another call captured it)", async () => {
    const { checkoutId, reference } = await paidHold({ "leather-tote-tan": 1 });
    fake.failSettle(reference);
    fake.set(reference, { status: "paid" });
    expect(await fulfil(deps, checkoutId)).toMatchObject({ status: "confirmed", order: { status: "paid" } });
  });

  it("cancels the order when the payment can no longer be captured: the stock goes back once, nothing is charged", async () => {
    const { checkoutId, reference } = await paidHold({ "leather-tote-tan": 2 });
    const held = await stockOf("leather-tote-tan");
    // The capture finds the authorisation lapsed (or cancelled at the bank).
    lapseAtCapture(reference);

    expect(await fulfil(deps, checkoutId)).toEqual({ status: "failed" });
    expect((await allOrders())[0]?.status).toBe("cancelled");
    expect(await stockOf("leather-tote-tan")).toBe(held + 2);
    expect(fake.payments.get(reference)).toMatchObject({ settled: 0 });

    // Calling again changes nothing: no second order, the stock isn't returned twice.
    expect(await fulfil(deps, checkoutId)).toEqual({ status: "failed" });
    expect(await allOrders()).toHaveLength(1);
    expect(await stockOf("leather-tote-tan")).toBe(held + 2);
    await settleDeferred();
    expect(sent).toHaveLength(0);
  });

  it("repeats the undo of a cancelled order while its payment is still authorised", async () => {
    const { checkoutId, reference } = await paidHold({ "leather-tote-tan": 1 });
    lapseAtCapture(reference);
    await fulfil(deps, checkoutId);
    // Say the bank later reports it held after all.
    fake.set(reference, { status: "authorised" });
    expect(await fulfil(deps, checkoutId)).toEqual({ status: "failed" });
    expect(fake.payments.get(reference)?.undone).toBe(1);
  });

  it("resumes an order an earlier call left in pending_capture: captures it without a second order or touching stock", async () => {
    const { checkoutId, reference } = await paidHold({ "leather-tote-tan": 1 });
    const held = await stockOf("leather-tote-tan");
    // The first call committed the order, then stopped before capturing (say, a timeout).
    const settle = fake.provider.settle;
    fake.provider.settle = () => new Promise(() => {});
    void fulfil(deps, checkoutId);
    await vi.waitFor(async () => expect(await allOrders()).toHaveLength(1));
    fake.provider.settle = settle;
    expect((await allOrders())[0]?.status).toBe("pending_capture");

    expect(await fulfil(deps, checkoutId)).toMatchObject({ status: "confirmed", order: { status: "paid" } });
    expect(await allOrders()).toHaveLength(1);
    expect((await allOrders())[0]?.status).toBe("paid");
    expect(fake.payments.get(reference)?.settled).toBe(1);
    expect(await stockOf("leather-tote-tan")).toBe(held);
  });

  it("undoes and never fulfils a payment whose amount or currency differs from the hold's", async () => {
    const first = await paidHold({ "leather-tote-tan": 1 });
    fake.set(first.reference, { amount: 1 });
    const held = await stockOf("leather-tote-tan");
    expect(await fulfil(deps, first.checkoutId)).toEqual({ status: "failed" });
    expect(fake.payments.get(first.reference)).toMatchObject({ undone: 1, settled: 0 });
    expect(await statusOf(first.checkoutId)).toBe("expired");
    expect(await stockOf("leather-tote-tan")).toBe(held + 1);

    const second = await paidHold({ "double-monk-shoe": 1 });
    fake.set(second.reference, { currency: "EUR" });
    expect(await fulfil(deps, second.checkoutId)).toEqual({ status: "failed" });
    expect(fake.payments.get(second.reference)?.undone).toBe(1);
    expect(await allOrders()).toHaveLength(0);
    expect(console.error).toHaveBeenCalled();
  });

  it("changes nothing for a payment that's pending or failed", async () => {
    const { checkoutId, reference } = await paidHold({ "leather-tote-tan": 1 }, { authorise: false });
    const held = await stockOf("leather-tote-tan");
    expect(await fulfil(deps, checkoutId)).toEqual({ status: "pending" });
    fake.set(reference, { status: "failed" });
    expect(await fulfil(deps, checkoutId)).toEqual({ status: "failed" });
    expect(await allOrders()).toHaveLength(0);
    expect(await statusOf(checkoutId)).toBe("open");
    expect(await stockOf("leather-tote-tan")).toBe(held);
    expect(fake.payments.get(reference)).toMatchObject({ undone: 0, settled: 0 });
  });

  it("answers failed for an unknown checkout", async () => {
    expect(await fulfil(deps, "00000000-0000-4000-8000-000000000000")).toEqual({ status: "failed" });
  });

  it("keeps a signed-in shopper's order in their account, with no guest key", async () => {
    const userId = "user_1";
    await db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at) values (${userId}, 'Ada', 'ada@example.test', false, now(), now())`);
    const { checkoutId } = await paidHold({ "leather-tote-tan": 1 }, { userId });
    expect(await fulfil(deps, checkoutId)).toMatchObject({ status: "confirmed", order: { userId } });
    expect((await allOrders())[0]?.guestKeyHash).toBeNull();
    // The account can go; the order stays.
    await db.execute(sql`delete from "user" where id = ${userId}`);
    expect((await allOrders())[0]?.userId).toBeNull();
    expect(await db.select().from(orderItems)).toHaveLength(1);
  });
});

describe("the confirmation email", () => {
  it("goes out once for two calls, with the order's link and an idempotency key", async () => {
    const { checkoutId } = await paidHold({ "leather-tote-tan": 1 });
    await Promise.all([fulfil(deps, checkoutId), fulfil(deps, checkoutId)]);
    await fulfil(deps, checkoutId);
    await settleDeferred();

    expect(sent).toHaveLength(1);
    const [{ email, options }] = sent as [(typeof sent)[number]];
    const [order] = await allOrders();
    expect(email.to).toBe("shopper@example.test");
    expect(email.subject).toBe("Your Orra order ORR-10001 is confirmed");
    expect(email.text).toContain(`https://orra.test/orders/ORR-10001?key=${guestOrderKey(deps.secret, order!.id)}`);
    expect(options).toEqual({ idempotencyKey: `order-confirmation/${order!.id}`, logLink: false });
    expect(order?.emailSentAt).toBeInstanceOf(Date);
  });

  it("links a signed-in shopper's email to the order in their account", async () => {
    const userId = "user_1";
    await db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at) values (${userId}, 'Ada', 'ada@example.test', false, now(), now())`);
    const { checkoutId } = await paidHold({ "leather-tote-tan": 1 }, { userId });
    await fulfil(deps, checkoutId);
    await settleDeferred();
    expect(sent[0]?.email.text).toContain("https://orra.test/account/orders/ORR-10001");
    expect(sent[0]?.email.text).not.toContain("key=");
  });

  it("after a failed send, leaves it unsent and unclaimed, so the next call sends it", async () => {
    const { checkoutId } = await paidHold({ "leather-tote-tan": 1 });
    sendOk = false;
    await fulfil(deps, checkoutId);
    await settleDeferred();
    expect(sent).toHaveLength(1);
    expect((await allOrders())[0]).toMatchObject({ emailSentAt: null, emailAttemptedAt: null });

    sendOk = true;
    await fulfil(deps, checkoutId);
    await settleDeferred();
    expect(sent).toHaveLength(2);
    expect((await allOrders())[0]?.emailSentAt).toBeInstanceOf(Date);
  });

  it("leaves a fresh claim alone, and takes over one abandoned for more than 10 minutes", async () => {
    const { checkoutId } = await paidHold({ "leather-tote-tan": 1 });
    sendOk = false;
    await fulfil(deps, checkoutId);
    await settleDeferred();
    sendOk = true;
    sent = [];

    // Another sender is mid-send (claimed a minute ago).
    await db.update(orders).set({ emailAttemptedAt: new Date(Date.now() - 60_000) });
    await fulfil(deps, checkoutId);
    await settleDeferred();
    expect(sent).toHaveLength(0);

    // That sender was cut off.
    await db.update(orders).set({ emailAttemptedAt: new Date(Date.now() - 11 * 60_000) });
    await fulfil(deps, checkoutId);
    await settleDeferred();
    expect(sent).toHaveLength(1);
    expect((await allOrders())[0]?.emailSentAt).toBeInstanceOf(Date);
  });
});
