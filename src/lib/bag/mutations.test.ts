import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { cartItems, products } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { createTestDb } from "@/test/db";
import { ensureCart } from "./cart";
import { BAG_LINE_LIMIT, MAX_QUANTITY } from "./limits";
import { addLine, removeLine, setLineQuantity } from "./mutations";
import { readBag } from "./queries";

let db: SeedDatabase;

beforeAll(async () => {
  db = await createTestDb();
});

async function newCart(): Promise<string> {
  return (await ensureCart(db, { userId: null, guestCartId: null })).id;
}

async function setStock(slug: string, stock: number) {
  await db.update(products).set({ stock }).where(eq(products.slug, slug));
}

/** The quantity stored in cart_items, before any read corrects it. */
async function stored(cartId: string, slug: string): Promise<number | undefined> {
  const [row] = await db
    .select({ quantity: cartItems.quantity })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .where(sql`${cartItems.cartId} = ${cartId} and ${products.slug} = ${slug}`);
  return row?.quantity;
}

async function inStockSlugs(count: number): Promise<string[]> {
  const rows = await db.select({ slug: products.slug }).from(products).where(sql`${products.stock} > 0`).limit(count);
  return rows.map((row) => row.slug);
}

describe("addLine", () => {
  it("adds a line, then sums further adds", async () => {
    const cart = await newCart();
    await setStock("leather-tote-tan", 5);
    expect((await addLine(db, cart, "leather-tote-tan", 1)).capped).toBe(false);
    const { bag, capped } = await addLine(db, cart, "leather-tote-tan", 2);
    expect(capped).toBe(false);
    expect(bag.lines.map((line) => [line.slug, line.quantity])).toEqual([["leather-tote-tan", 3]]);
    expect(bag.count).toBe(3);
    expect(bag.subtotal).toBe(bag.lines[0].unitPrice * 3);
    expect(bag.currency).toBe("USD");
  });

  it("caps at live stock and at MAX_QUANTITY, saying so", async () => {
    const cart = await newCart();
    await setStock("double-monk-shoe", 2);
    await addLine(db, cart, "double-monk-shoe", 1);
    const { bag, capped } = await addLine(db, cart, "double-monk-shoe", 5);
    expect(capped).toBe(true);
    expect(bag.lines[0].quantity).toBe(2);
    expect(await stored(cart, "double-monk-shoe")).toBe(2);

    // Adding again when the bag already holds all the stock says so.
    const again = await addLine(db, cart, "double-monk-shoe", 2);
    expect(again.capped).toBe(true);
    expect(again.bag.lines[0].quantity).toBe(2);

    await setStock("leather-tote-tan", 50);
    const other = await newCart();
    const big = await addLine(db, other, "leather-tote-tan", MAX_QUANTITY + 3);
    expect(big.capped).toBe(true);
    expect(big.bag.lines[0].quantity).toBe(MAX_QUANTITY);
  });

  it("never passes stock under concurrent adds", async () => {
    const cart = await newCart();
    await setStock("leather-tote-tan", 3);
    await Promise.all(Array.from({ length: 10 }, () => addLine(db, cart, "leather-tote-tan", 1)));
    expect(await stored(cart, "leather-tote-tan")).toBe(3);
  });

  it("refuses a sold-out product, and reports an unknown slug and a full bag", async () => {
    const cart = await newCart();
    await setStock("gold-hoop-earrings", 0);
    const soldOut = await addLine(db, cart, "gold-hoop-earrings", 1);
    expect(soldOut.capped).toBe(true);
    expect(soldOut.bag.lines).toEqual([]);
    await expect(addLine(db, cart, "no-such-product", 1)).rejects.toThrow(/not a product/i);

    // The seed has fewer products than a full bag, so add in-stock copies.
    await db.execute(sql`
      insert into products (slug, name, category_id, audience, price, colour, colour_family, material, description, details, images, stock)
      select slug || '-full-' || g, name, category_id, audience, price, colour, colour_family, material, description, details, images, 5
      from products cross join generate_series(1, 2) as g where slug not like '%-full-%'`);
    const full = await newCart();
    const slugs = await inStockSlugs(BAG_LINE_LIMIT + 1);
    expect(slugs).toHaveLength(BAG_LINE_LIMIT + 1);
    for (const slug of slugs.slice(0, BAG_LINE_LIMIT)) await addLine(db, full, slug, 1);
    await expect(addLine(db, full, slugs[BAG_LINE_LIMIT], 1)).rejects.toThrow(/bag is full/i);
    // A product already in a full bag can still be added to.
    expect((await addLine(db, full, slugs[0], 1)).bag.lines).toHaveLength(BAG_LINE_LIMIT);
  });
});

describe("setLineQuantity and removeLine", () => {
  it("sets a quantity, capped at stock, and removes a line", async () => {
    const cart = await newCart();
    await setStock("leather-tote-tan", 4);
    await addLine(db, cart, "leather-tote-tan", 1);
    expect((await setLineQuantity(db, cart, "leather-tote-tan", 3)).bag.lines[0].quantity).toBe(3);
    const capped = await setLineQuantity(db, cart, "leather-tote-tan", 9);
    expect(capped.capped).toBe(true);
    expect(capped.bag.lines[0].quantity).toBe(4);
    expect((await removeLine(db, cart, "leather-tote-tan")).bag.lines).toEqual([]);
  });
});

describe("readBag", () => {
  it("lowers a line above stock and marks it; keeps a sold-out line out of the totals", async () => {
    const cart = await newCart();
    await setStock("leather-tote-tan", 5);
    await setStock("double-monk-shoe", 5);
    await addLine(db, cart, "leather-tote-tan", 4);
    await addLine(db, cart, "double-monk-shoe", 2);
    await setStock("leather-tote-tan", 2);
    await setStock("double-monk-shoe", 0);

    const bag = await readBag(db, cart);
    const tote = bag.lines.find((line) => line.slug === "leather-tote-tan")!;
    const shoe = bag.lines.find((line) => line.slug === "double-monk-shoe")!;
    expect(tote).toMatchObject({ quantity: 2, stock: 2, note: "reduced" });
    expect(shoe).toMatchObject({ stock: 0, note: "sold-out" });
    expect(bag.count).toBe(2);
    expect(bag.subtotal).toBe(tote.unitPrice * 2);
    // The reduction is stored, so the next read has nothing to report.
    expect((await readBag(db, cart)).lines.find((line) => line.slug === "leather-tote-tan")!.note).toBeNull();
  });

  it("returns the card fields: name, colour, price and one image", async () => {
    const cart = await newCart();
    await setStock("leather-tote-tan", 5);
    const { bag } = await addLine(db, cart, "leather-tote-tan", 1);
    expect(bag.lines[0]).toMatchObject({ slug: "leather-tote-tan", name: expect.any(String), colour: expect.any(String), unitPrice: expect.any(Number) });
    expect(bag.lines[0].image).toMatchObject({ src: expect.any(String), alt: expect.any(String) });
  });
});
