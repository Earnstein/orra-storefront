import { eq, inArray, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { carts, checkoutItems, checkouts, products } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { createTestDb } from "@/test/db";
import { createHold, findOpenHold, releaseExpiredHolds, releaseHold, takeStock, type HoldLine } from "./holds";

let db: SeedDatabase;

beforeEach(async () => {
  db = await createTestDb();
});

async function product(slug: string) {
  const [row] = await db.select({ id: products.id, name: products.name, price: products.price, stock: products.stock }).from(products).where(eq(products.slug, slug));
  return row!;
}

const stockOf = async (id: number) => (await db.select({ stock: products.stock }).from(products).where(eq(products.id, id)))[0]!.stock;
const setStock = (id: number, stock: number) => db.update(products).set({ stock }).where(eq(products.id, id));
const newCart = async () => (await db.insert(carts).values({}).returning({ id: carts.id }))[0]!.id;
const line = (p: { id: number; name: string; price: number }, quantity: number): HoldLine => ({ productId: p.id, name: p.name, unitPrice: p.price, quantity });
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000);

/** Holds lines the way startCheckout does: take the stock, then record the hold, all or nothing. */
async function hold(cartId: string, lines: HoldLine[], expiresAt = inMinutes(31)) {
  return db.transaction(async (tx) => {
    const taken = await takeStock(tx, lines);
    if (!taken.ok) {
      tx.rollback();
    }
    return createHold(tx, { cartId, userId: null, email: "shopper@example.test", lines, expiresAt });
  });
}

describe("holds", () => {
  it("take the stock and record the lines at today's names and prices; releasing puts the stock back once", async () => {
    const tote = await product("leather-tote-tan");
    const before = tote.stock;
    const cartId = await newCart();
    const { id } = await hold(cartId, [line(tote, 2)]);

    expect(await stockOf(tote.id)).toBe(before - 2);
    const open = await findOpenHold(db, cartId);
    expect(open).toMatchObject({ id, email: "shopper@example.test", amount: tote.price * 2, paymentReference: null });
    expect(open?.lines).toEqual([{ productId: tote.id, name: tote.name, unitPrice: tote.price, quantity: 2 }]);

    expect(await releaseHold(db, id)).toBe(true);
    expect(await stockOf(tote.id)).toBe(before);
    expect(await releaseHold(db, id)).toBe(false);
    expect(await stockOf(tote.id)).toBe(before);
    expect(await findOpenHold(db, cartId)).toBeNull();
    expect((await db.select({ status: checkouts.status }).from(checkouts).where(eq(checkouts.id, id)))[0]?.status).toBe("expired");
  });

  it("aren't found once their time has run out, even before the sweep", async () => {
    const tote = await product("leather-tote-tan");
    const cartId = await newCart();
    await hold(cartId, [line(tote, 1)], inMinutes(-1));
    expect(await findOpenHold(db, cartId)).toBeNull();
  });

  it("take nothing when any line is short (all or nothing)", async () => {
    const tote = await product("leather-tote-tan");
    const shoe = await product("double-monk-shoe");
    await setStock(shoe.id, 1);
    const toteBefore = await stockOf(tote.id);

    let result: Awaited<ReturnType<typeof takeStock>> | undefined;
    await expect(
      db.transaction(async (tx) => {
        result = await takeStock(tx, [line(tote, 1), line(shoe, 2)]);
        // The caller rolls back on a short line.
        tx.rollback();
      }),
    ).rejects.toThrow();
    expect(result).toEqual({ ok: false, short: [{ productId: shoe.id, available: 1 }] });
    await expect(hold(await newCart(), [line(tote, 1), line(shoe, 2)])).rejects.toThrow();
    expect(await stockOf(tote.id)).toBe(toteBefore);
    expect(await stockOf(shoe.id)).toBe(1);
    expect(await db.select().from(checkouts)).toHaveLength(0);
  });

  it("let only one of two shoppers take the last unit, and stock never goes below zero", async () => {
    const shoe = await product("double-monk-shoe");
    await setStock(shoe.id, 1);
    const [a, b] = [await newCart(), await newCart()];
    const results = await Promise.allSettled([hold(a, [line(shoe, 1)]), hold(b, [line(shoe, 1)])]);

    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await stockOf(shoe.id)).toBe(0);
    expect(await db.select().from(checkouts)).toHaveLength(1);
  });

  it("allow one open hold per bag", async () => {
    const tote = await product("leather-tote-tan");
    const cartId = await newCart();
    const first = await hold(cartId, [line(tote, 1)]);
    await expect(hold(cartId, [line(tote, 1)])).rejects.toThrow();
    // Once released, the bag can hold again.
    await releaseHold(db, first.id);
    await expect(hold(cartId, [line(tote, 1)])).resolves.toMatchObject({ id: expect.any(String) });
  });

  it("are swept once expired past the grace: only those open holds are released, each line's stock returned, and the count answered", async () => {
    await setStock((await product("leather-tote-tan")).id, 10);
    await setStock((await product("double-monk-shoe")).id, 10);
    const tote = await product("leather-tote-tan");
    const shoe = await product("double-monk-shoe");
    const [toteBefore, shoeBefore] = [tote.stock, shoe.stock];
    const lapsed1 = await hold(await newCart(), [line(tote, 2), line(shoe, 1)], inMinutes(-5));
    const lapsed2 = await hold(await newCart(), [line(tote, 1)], inMinutes(-3));
    // Ran out a minute ago: a payment authorised at the last moment may still be on its way.
    const justRunOut = await hold(await newCart(), [line(shoe, 1)], inMinutes(-1));
    const current = await hold(await newCart(), [line(tote, 1)]);
    const paid = await hold(await newCart(), [line(shoe, 1)], inMinutes(-10));
    await db.update(checkouts).set({ status: "fulfilled" }).where(eq(checkouts.id, paid.id));

    expect(await releaseExpiredHolds(db)).toBe(2);
    expect(await stockOf(tote.id)).toBe(toteBefore - 1);
    expect(await stockOf(shoe.id)).toBe(shoeBefore - 2);
    const statuses = await db
      .select({ id: checkouts.id, status: checkouts.status })
      .from(checkouts)
      .where(inArray(checkouts.id, [lapsed1.id, lapsed2.id, justRunOut.id, current.id, paid.id]));
    expect(Object.fromEntries(statuses.map((s) => [s.id, s.status]))).toEqual({
      [lapsed1.id]: "expired",
      [lapsed2.id]: "expired",
      [justRunOut.id]: "open",
      [current.id]: "open",
      [paid.id]: "fulfilled",
    });
    expect(await releaseExpiredHolds(db)).toBe(0);
    expect(await stockOf(tote.id)).toBe(toteBefore - 1);
  });

  it("outlive the bag they came from, so they can still be released", async () => {
    const tote = await product("leather-tote-tan");
    const cartId = await newCart();
    const { id } = await hold(cartId, [line(tote, 1)]);
    await db.delete(carts).where(eq(carts.id, cartId));
    expect(await releaseHold(db, id)).toBe(true);
    expect(await stockOf(tote.id)).toBe(tote.stock);
    expect((await db.select().from(checkoutItems).where(eq(checkoutItems.checkoutId, id))).length).toBe(1);
  });

  it("keep products they refer to from being deleted", async () => {
    const tote = await product("leather-tote-tan");
    await hold(await newCart(), [line(tote, 1)]);
    await expect(db.execute(sql`delete from products where id = ${tote.id}`)).rejects.toThrow();
  });
});
