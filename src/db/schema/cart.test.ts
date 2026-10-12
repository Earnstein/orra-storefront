import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { cartItems, carts, products, user } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { createTestDb } from "@/test/db";

let db: SeedDatabase;
let next = 0;

beforeAll(async () => {
  db = await createTestDb();
});

async function newUser(): Promise<string> {
  const id = `user-${++next}`;
  await db.insert(user).values({ id, name: "Ada", email: `${id}@example.test` });
  return id;
}

async function productId(slug: string): Promise<number> {
  const [row] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug));
  return row.id;
}

describe("carts and cart_items", () => {
  it("deletes a user's cart and its items with the user", async () => {
    const userId = await newUser();
    const [cart] = await db.insert(carts).values({ userId }).returning();
    await db.insert(cartItems).values({ cartId: cart.id, productId: await productId("leather-tote-tan"), quantity: 1 });
    await db.delete(user).where(eq(user.id, userId));
    expect(await db.select().from(carts).where(eq(carts.id, cart.id))).toEqual([]);
    expect(await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id))).toEqual([]);
  });

  it("deletes a product's lines with the product", async () => {
    const [cart] = await db.insert(carts).values({}).returning();
    const { rows } = (await db.execute(sql`
      insert into products (slug, name, category_id, audience, price, colour, colour_family, material, description, details, images, stock)
      select 'doomed-copy', name, category_id, audience, price, colour, colour_family, material, description, details, images, stock
      from products where slug = 'leather-tote-tan'
      returning id`)) as unknown as { rows: { id: number }[] };
    const doomed = rows[0];
    await db.insert(cartItems).values({ cartId: cart.id, productId: doomed.id, quantity: 1 });
    await db.delete(products).where(eq(products.id, doomed.id));
    expect(await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id))).toEqual([]);
  });

  it("refuses a quantity of zero", async () => {
    const [cart] = await db.insert(carts).values({}).returning();
    await expect(db.insert(cartItems).values({ cartId: cart.id, productId: await productId("leather-tote-tan"), quantity: 0 })).rejects.toThrow();
  });

  it("gives each user one cart, and guests any number", async () => {
    const userId = await newUser();
    await db.insert(carts).values({ userId });
    await expect(db.insert(carts).values({ userId })).rejects.toThrow();
    const guests = await db.insert(carts).values([{}, {}]).returning();
    expect(guests.map((cart) => cart.userId)).toEqual([null, null]);
    expect(guests[0].id).not.toBe(guests[1].id);
  });

  it("keeps one line per product in a cart", async () => {
    const [cart] = await db.insert(carts).values({}).returning();
    const productIdValue = await productId("leather-tote-tan");
    await db.insert(cartItems).values({ cartId: cart.id, productId: productIdValue, quantity: 1 });
    await expect(db.insert(cartItems).values({ cartId: cart.id, productId: productIdValue, quantity: 2 })).rejects.toThrow();
  });
});
