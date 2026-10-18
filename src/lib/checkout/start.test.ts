import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { checkouts, products } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { ensureCart } from "@/lib/bag/cart";
import { mergeGuestCart } from "@/lib/bag/merge";
import { addLine, setLineQuantity } from "@/lib/bag/mutations";
import { readBag } from "@/lib/bag/queries";
import { createFakeProvider, type FakeProvider } from "@/lib/payments/fake";
import { PaymentsUnavailableError } from "@/lib/payments/types";
import { createTestAuth } from "@/test/auth";
import { createTestDb } from "@/test/db";
import { HOLD_MINUTES, startCheckoutWith, type StartDeps } from "./start";

let db: SeedDatabase;
let fake: FakeProvider;
let deps: StartDeps;
const NOW = new Date();

beforeEach(async () => {
  db = await createTestDb();
  fake = createFakeProvider();
  deps = { db, transact: (fn) => db.transaction(fn), provider: () => fake.provider, rateLimit: false, baseUrl: "https://orra.test" };
});

const product = async (slug: string) =>
  (await db.select({ id: products.id, name: products.name, price: products.price, stock: products.stock }).from(products).where(eq(products.slug, slug)))[0]!;
const stockOf = async (slug: string) => (await product(slug)).stock;
const setStock = (slug: string, stock: number) => db.update(products).set({ stock }).where(eq(products.slug, slug));

async function guestBag(lines: Record<string, number>) {
  const { id } = await ensureCart(db, { userId: null, guestCartId: null });
  for (const [slug, quantity] of Object.entries(lines)) await addLine(db, id, slug, quantity);
  return { cartId: id, cart: { userId: null, guestCartId: id } };
}

const start = (cart: { userId: string | null; guestCartId: string | null }, overrides: Partial<StartDeps> = {}, ip: string | null = "203.0.113.7") =>
  startCheckoutWith({ ...deps, ...overrides }, { cart, email: "shopper@example.test", ip });

describe("startCheckout", () => {
  it("holds the bag's stock, starts the payment at database prices with the hold's expiry, and stores the reference", async () => {
    const tote = await product("leather-tote-tan");
    const shoe = await product("double-monk-shoe");
    const { cart } = await guestBag({ "leather-tote-tan": 2, "double-monk-shoe": 1 });

    const result = await start(cart);
    if (!result.ok) throw new Error(result.message);
    const { checkoutId, clientSecret, expiresAt, summary } = result.data;

    expect(await stockOf("leather-tote-tan")).toBe(tote.stock - 2);
    expect(await stockOf("double-monk-shoe")).toBe(shoe.stock - 1);
    expect(clientSecret).toBe("fake_1_secret");
    expect(summary.count).toBe(3);
    const minutes = (new Date(expiresAt).getTime() - NOW.getTime()) / 60_000;
    expect(minutes).toBeGreaterThan(HOLD_MINUTES - 1);
    expect(minutes).toBeLessThan(HOLD_MINUTES + 1);

    const payment = fake.payments.get("fake_1")!;
    expect(payment.input).toMatchObject({ checkoutId, email: "shopper@example.test", currency: "USD", returnUrl: `https://orra.test/checkout/success?checkout=${checkoutId}` });
    expect(payment.input.expiresAt.toISOString()).toBe(expiresAt);
    expect(payment.input.lines.map(({ name, unitPrice, quantity }) => ({ name, unitPrice, quantity })).sort((a, b) => a.name.localeCompare(b.name))).toEqual(
      [
        { name: tote.name, unitPrice: tote.price, quantity: 2 },
        { name: shoe.name, unitPrice: shoe.price, quantity: 1 },
      ].sort((a, b) => a.name.localeCompare(b.name)),
    );
    expect(payment.amount).toBe(tote.price * 2 + shoe.price);

    const [row] = await db.select().from(checkouts).where(eq(checkouts.id, checkoutId));
    expect(row).toMatchObject({ status: "open", paymentProvider: "fake", paymentReference: "fake_1", amount: tote.price * 2 + shoe.price, email: "shopper@example.test" });
  });

  it("reuses the hold when the bag hasn't changed: no more stock taken, the same payment", async () => {
    const tote = await product("leather-tote-tan");
    const { cart } = await guestBag({ "leather-tote-tan": 1 });
    const first = await start(cart);
    const second = await start(cart);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.data.checkoutId).toBe(first.data.checkoutId);
    expect(second.data.clientSecret).toBe(first.data.clientSecret);
    expect(await stockOf("leather-tote-tan")).toBe(tote.stock - 1);
    expect(fake.started).toBe(1);
  });

  it("resumes the hold's payment on reuse, even when the bag's lines come back in another order", async () => {
    const { cart, cartId } = await guestBag({ "leather-tote-tan": 1, "double-monk-shoe": 1 });
    const first = await start(cart);
    // Remove, then Undo: the line comes back at the top of the bag.
    await db.execute(sql`delete from cart_items where cart_id = ${cartId} and product_id = (select id from products where slug = 'leather-tote-tan')`);
    await addLine(db, cartId, "leather-tote-tan", 1);
    const second = await start(cart);
    if (!first.ok || !second.ok) throw new Error("expected both to start");
    expect(second.data).toMatchObject({ checkoutId: first.data.checkoutId, clientSecret: first.data.clientSecret });
    expect(fake.started).toBe(1);
    expect(fake.payments.get("fake_1")?.resumed).toBe(1);
  });

  it("keeps a reused hold when its payment can't be resumed", async () => {
    const tote = await product("leather-tote-tan");
    const { cart } = await guestBag({ "leather-tote-tan": 1 });
    const first = await start(cart);
    if (!first.ok) throw new Error(first.message);
    fake.set("fake_1", { status: "authorised" });
    expect(await start(cart)).toMatchObject({ ok: false, error: "failed" });
    expect(await stockOf("leather-tote-tan")).toBe(tote.stock - 1);
    expect((await db.select({ status: checkouts.status }).from(checkouts).where(eq(checkouts.id, first.data.checkoutId)))[0]?.status).toBe("open");
  });

  it("undoes a replaced hold's payment even when the new payment can't start", async () => {
    const tote = await product("leather-tote-tan");
    const { cart, cartId } = await guestBag({ "leather-tote-tan": 1 });
    expect((await start(cart)).ok).toBe(true);
    await setLineQuantity(db, cartId, "leather-tote-tan", 2);
    const failing = { ...fake.provider, startPayment: async () => Promise.reject(new Error("stripe is down")) };
    expect(await start(cart, { provider: () => failing })).toMatchObject({ ok: false, error: "failed" });
    expect(fake.payments.get("fake_1")?.undone).toBe(1);
    expect(await stockOf("leather-tote-tan")).toBe(tote.stock);
    expect(await db.select().from(checkouts).where(eq(checkouts.status, "open"))).toHaveLength(0);
  });

  it("gives two starts for the same bag at once one hold and one payment, and never says sold out", async () => {
    await setStock("double-monk-shoe", 1);
    const { cart } = await guestBag({ "double-monk-shoe": 1 });
    const [a, b] = await Promise.all([start(cart), start(cart)]);
    if (!a.ok || !b.ok) throw new Error(`expected both to start: ${JSON.stringify([a, b].map((r) => (r.ok ? "ok" : r.message)))}`);
    expect(b.data.checkoutId).toBe(a.data.checkoutId);
    expect(b.data.clientSecret).toBe(a.data.clientSecret);
    expect(await stockOf("double-monk-shoe")).toBe(0);
    expect(await db.select().from(checkouts)).toHaveLength(1);
    expect(fake.started).toBe(1);
  });

  it("releases the old hold (stock back, its payment undone) and holds again when the bag changed", async () => {
    const tote = await product("leather-tote-tan");
    const { cart, cartId } = await guestBag({ "leather-tote-tan": 1 });
    const first = await start(cart);
    await setLineQuantity(db, cartId, "leather-tote-tan", 2);
    const second = await start(cart);
    if (!first.ok || !second.ok) throw new Error("expected both to start");

    expect(second.data.checkoutId).not.toBe(first.data.checkoutId);
    expect(await stockOf("leather-tote-tan")).toBe(tote.stock - 2);
    expect(fake.payments.get("fake_1")?.undone).toBe(1);
    const statuses = await db.select({ id: checkouts.id, status: checkouts.status }).from(checkouts);
    expect(statuses.find((s) => s.id === first.data.checkoutId)?.status).toBe("expired");
    expect(statuses.find((s) => s.id === second.data.checkoutId)?.status).toBe("open");
  });

  it("replacing a hold doesn't cancel a payment authorised in its last seconds; fulfilment takes it", async () => {
    const { cart, cartId } = await guestBag({ "leather-tote-tan": 1 });
    expect((await start(cart)).ok).toBe(true);
    // The shopper paid just as the bag changed in another tab (or the hold ran out under them).
    fake.set("fake_1", { status: "authorised" });
    await setLineQuantity(db, cartId, "leather-tote-tan", 2);
    expect((await start(cart)).ok).toBe(true);
    expect(fake.payments.get("fake_1")?.undone).toBe(0);
  });

  it("starts a new hold when the email changes", async () => {
    const { cart } = await guestBag({ "leather-tote-tan": 1 });
    const first = await start(cart);
    const second = await startCheckoutWith(deps, { cart, email: "other@example.test", ip: null });
    if (!first.ok || !second.ok) throw new Error("expected both to start");
    expect(second.data.checkoutId).not.toBe(first.data.checkoutId);
  });

  it("holds nothing and says so when a line was lowered to the stock left", async () => {
    const { cart } = await guestBag({ "double-monk-shoe": 2 });
    await setStock("double-monk-shoe", 1);
    const result = await start(cart);
    expect(result).toMatchObject({
      ok: false,
      error: "invalid",
      reason: "short",
      message: "Only 1 Double-monk shoe was left — your bag has been updated",
      short: [{ slug: "double-monk-shoe", name: "Double-monk shoe", available: 1 }],
    });
    if (result.ok || !("reason" in result) || result.reason !== "short") return;
    expect(result.bag.lines[0]).toMatchObject({ slug: "double-monk-shoe", quantity: 1 });
    expect(await stockOf("double-monk-shoe")).toBe(1);
    expect(await db.select().from(checkouts)).toHaveLength(0);
    expect(fake.started).toBe(0);
  });

  it("skips sold-out lines that are already in the bag", async () => {
    const { cart } = await guestBag({ "leather-tote-tan": 1, "double-monk-shoe": 1 });
    await setStock("double-monk-shoe", 0);
    const result = await start(cart);
    if (!result.ok) throw new Error(result.message);
    expect(fake.payments.get("fake_1")?.input.lines.map((l) => l.name)).toEqual(["Leather tote"]);
  });

  it("lets only one of two shoppers hold the last unit", async () => {
    await setStock("double-monk-shoe", 2);
    const a = await guestBag({ "double-monk-shoe": 1 });
    const b = await guestBag({ "double-monk-shoe": 1 });
    await setStock("double-monk-shoe", 1);
    const results = await Promise.all([start(a.cart), start(b.cart)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, reason: "short", short: [{ slug: "double-monk-shoe", available: 0 }] });
    expect(await stockOf("double-monk-shoe")).toBe(0);
    expect(await db.select().from(checkouts)).toHaveLength(1);
  });

  it("answers empty for a missing or empty bag", async () => {
    expect(await start({ userId: null, guestCartId: null })).toMatchObject({ ok: false, reason: "empty" });
    const { id } = await ensureCart(db, { userId: null, guestCartId: null });
    expect(await start({ userId: null, guestCartId: id })).toMatchObject({ ok: false, reason: "empty" });
  });

  it("releases an emptied bag's hold and closes its payment", async () => {
    const tote = await product("leather-tote-tan");
    const { cart, cartId } = await guestBag({ "leather-tote-tan": 1 });
    expect((await start(cart)).ok).toBe(true);
    await db.execute(sql`delete from cart_items where cart_id = ${cartId}`);
    expect(await start(cart)).toMatchObject({ ok: false, reason: "empty" });
    expect(await stockOf("leather-tote-tan")).toBe(tote.stock);
    expect(fake.payments.get("fake_1")?.undone).toBe(1);
  });

  it("answers empty before checking whether payments are configured", async () => {
    const unavailable = { provider: () => { throw new PaymentsUnavailableError(); } };
    expect(await start({ userId: null, guestCartId: null }, unavailable)).toMatchObject({ ok: false, reason: "empty" });
  });

  it("leaves out a line whose product was archived, taking none of its stock", async () => {
    const { cart } = await guestBag({ "leather-tote-tan": 1, "double-monk-shoe": 1 });
    await db.update(products).set({ archivedAt: new Date() }).where(eq(products.slug, "double-monk-shoe"));
    const stock = await stockOf("double-monk-shoe");
    const result = await start(cart);
    if (!result.ok) throw new Error(result.message);
    expect(fake.payments.get("fake_1")?.input.lines.map((l) => l.name)).toEqual(["Leather tote"]);
    expect(await stockOf("double-monk-shoe")).toBe(stock);
  });

  it("answers short when the only line's product was archived", async () => {
    const { cart } = await guestBag({ "double-monk-shoe": 1 });
    await db.update(products).set({ archivedAt: new Date() }).where(eq(products.slug, "double-monk-shoe"));
    expect(await start(cart)).toMatchObject({
      ok: false,
      reason: "short",
      message: "The Double-monk shoe is no longer available — your bag has been updated",
    });
  });

  it("answers short (nothing to hold) when every line has sold out", async () => {
    const { cart } = await guestBag({ "double-monk-shoe": 1 });
    await setStock("double-monk-shoe", 0);
    expect(await start(cart)).toMatchObject({
      ok: false,
      reason: "short",
      message: "The Double-monk shoe sold out — your bag has been updated",
    });
  });

  it("releases expired holds before reading the bag, so a lapsed hold's stock can be held again", async () => {
    await setStock("double-monk-shoe", 1);
    const a = await guestBag({ "double-monk-shoe": 1 });
    const b = await guestBag({ "double-monk-shoe": 1 });
    const first = await start(a.cart);
    if (!first.ok) throw new Error(first.message);
    await db.update(checkouts).set({ expiresAt: new Date(Date.now() - 5 * 60_000) }).where(eq(checkouts.id, first.data.checkoutId));

    const second = await start(b.cart);
    expect(second.ok).toBe(true);
    expect(await stockOf("double-monk-shoe")).toBe(0);
  });

  it("limits each IP to 5 holds in 10 minutes when rate limiting is on; reusing a hold doesn't count", async () => {
    const { cart, cartId } = await guestBag({ "leather-tote-tan": 1 });
    const limited = { rateLimit: true };
    // Each change of quantity makes a new hold; starting again unchanged reuses it.
    for (const quantity of [1, 2, 1, 2, 1]) {
      await setLineQuantity(db, cartId, "leather-tote-tan", quantity);
      expect((await start(cart, limited)).ok).toBe(true);
      expect((await start(cart, limited)).ok).toBe(true);
    }
    await setLineQuantity(db, cartId, "leather-tote-tan", 2);
    expect(await start(cart, limited)).toMatchObject({ ok: false, reason: "rate-limited" });
    // Another IP isn't affected.
    expect((await start(cart, limited, "198.51.100.1")).ok).toBe(true);
  });

  it("answers unavailable, holding nothing, when payments aren't configured", async () => {
    const tote = await product("leather-tote-tan");
    const { cart } = await guestBag({ "leather-tote-tan": 1 });
    const result = await start(cart, {
      provider: () => {
        throw new PaymentsUnavailableError();
      },
    });
    expect(result).toMatchObject({ ok: false, reason: "unavailable" });
    expect(await stockOf("leather-tote-tan")).toBe(tote.stock);
  });

  it("releases the hold when the payment can't start", async () => {
    const tote = await product("leather-tote-tan");
    const { cart } = await guestBag({ "leather-tote-tan": 1 });
    const failing = { ...fake.provider, startPayment: async () => Promise.reject(new Error("stripe is down")) };
    const result = await start(cart, { provider: () => failing });
    expect(result).toMatchObject({ ok: false, error: "failed" });
    expect(await stockOf("leather-tote-tan")).toBe(tote.stock);
    expect((await db.select({ status: checkouts.status }).from(checkouts))[0]?.status).toBe("expired");
  });
});

describe("a shopper's own hold", () => {
  it("doesn't lower their bag or cap their next add, while other bags see only what's left", async () => {
    await setStock("leather-tote-tan", 3);
    const { cart, cartId } = await guestBag({ "leather-tote-tan": 2 });
    const other = await guestBag({ "leather-tote-tan": 3 });
    expect((await start(cart)).ok).toBe(true);
    expect(await stockOf("leather-tote-tan")).toBe(1);

    const mine = await readBag(db, cartId);
    expect(mine.lines[0]).toMatchObject({ quantity: 2, stock: 3, note: null });
    const added = await addLine(db, cartId, "leather-tote-tan", 1);
    expect(added.bag.lines[0]).toMatchObject({ quantity: 3, stock: 3 });
    expect(added.capped).toBe(false);

    const theirs = await readBag(db, other.cartId);
    expect(theirs.lines[0]).toMatchObject({ quantity: 1, stock: 1, note: "reduced" });
  });

  it("counts expired holds as returned before any sweep, so a product held in full isn't sold out for good", async () => {
    await setStock("leather-tote-tan", 2);
    const first = await guestBag({ "leather-tote-tan": 2 });
    const result = await start(first.cart);
    if (!result.ok) throw new Error(result.message);
    const other = await guestBag({});
    expect((await addLine(db, other.cartId, "leather-tote-tan", 1)).bag.lines).toHaveLength(0);

    await db.update(checkouts).set({ expiresAt: new Date(Date.now() - 5 * 60_000) }).where(eq(checkouts.id, result.data.checkoutId));
    expect((await addLine(db, other.cartId, "leather-tote-tan", 1)).bag.lines[0]).toMatchObject({ quantity: 1, stock: 2 });
    // Starting checkout sweeps the lapsed hold for real, then holds from the returned stock.
    expect((await start(other.cart)).ok).toBe(true);
    expect(await stockOf("leather-tote-tan")).toBe(1);
  });

  it("is released when the guest signs in, so the merged bag isn't capped by it", async () => {
    await setStock("leather-tote-tan", 2);
    const { cart, cartId } = await guestBag({ "leather-tote-tan": 2 });
    expect((await start(cart)).ok).toBe(true);
    expect(await stockOf("leather-tote-tan")).toBe(0);

    const { auth } = await createTestAuth(db);
    const { user } = await auth.api.signUpEmail({ body: { name: "Ada", email: "ada@example.test", password: "correct-horse" } });
    const released: string[] = [];
    const { cartId: userCartId } = await mergeGuestCart(db, { guestCartId: cartId, userId: user.id }, { onHoldsReleased: (references) => released.push(...references) });
    // Its payment is handed back to be undone (auth.ts does it after the response).
    expect(released).toEqual(["fake_1"]);

    expect(await stockOf("leather-tote-tan")).toBe(2);
    expect((await readBag(db, userCartId)).lines[0]).toMatchObject({ quantity: 2, note: null });
    expect((await db.select({ status: checkouts.status }).from(checkouts))[0]?.status).toBe("expired");
  });
});
