import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { carts, products, user } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { createTestAuth } from "@/test/auth";
import { createTestDb } from "@/test/db";
import { ensureCart } from "./cart";
import { signCartId } from "./cookies";
import { BAG_LINE_LIMIT, MAX_QUANTITY } from "./limits";
import { mergeGuestCart } from "./merge";
import { addLine } from "./mutations";
import { readBag } from "./queries";

const SECRET = "test-secret-that-is-at-least-32-characters";

let db: SeedDatabase;
let next = 0;

beforeAll(async () => {
  db = await createTestDb();
});

async function newUser(): Promise<string> {
  const id = `merge-user-${++next}`;
  await db.insert(user).values({ id, name: "Ada", email: `${id}@example.test` });
  return id;
}

async function setStock(slug: string, stock: number) {
  await db.update(products).set({ stock }).where(eq(products.slug, slug));
}

async function guestCart(lines: [string, number][]): Promise<string> {
  const { id } = await ensureCart(db, { userId: null, guestCartId: null });
  for (const [slug, quantity] of lines) await addLine(db, id, slug, quantity);
  return id;
}

const quantities = async (cartId: string) => Object.fromEntries((await readBag(db, cartId)).lines.map((line) => [line.slug, line.quantity]));

describe("mergeGuestCart", () => {
  it("moves a guest bag into the user's, summing and capping, then deletes the guest cart", async () => {
    await setStock("leather-tote-tan", 3);
    await setStock("double-monk-shoe", 20);
    const userId = await newUser();
    const own = await ensureCart(db, { userId, guestCartId: null });
    await addLine(db, own.id, "leather-tote-tan", 2);
    await addLine(db, own.id, "double-monk-shoe", 8);
    const guest = await guestCart([
      ["leather-tote-tan", 2],
      ["double-monk-shoe", 5],
    ]);

    const result = await mergeGuestCart(db, { guestCartId: guest, userId });
    expect(result.cartId).toBe(own.id);
    expect(await quantities(own.id)).toEqual({ "leather-tote-tan": 3, "double-monk-shoe": MAX_QUANTITY });
    expect(await db.select().from(carts).where(eq(carts.id, guest))).toEqual([]);
  });

  it("creates the user's cart when they have none, and does nothing more on a second merge", async () => {
    await setStock("leather-tote-tan", 5);
    const userId = await newUser();
    const guest = await guestCart([["leather-tote-tan", 2]]);
    const { cartId } = await mergeGuestCart(db, { guestCartId: guest, userId });
    expect(await quantities(cartId)).toEqual({ "leather-tote-tan": 2 });
    await mergeGuestCart(db, { guestCartId: guest, userId });
    expect(await quantities(cartId)).toEqual({ "leather-tote-tan": 2 });
  });

  it("never merges a user's cart as if it were a guest's", async () => {
    await setStock("leather-tote-tan", 5);
    const other = await newUser();
    const theirs = await ensureCart(db, { userId: other, guestCartId: null });
    await addLine(db, theirs.id, "leather-tote-tan", 1);
    const userId = await newUser();
    const { cartId } = await mergeGuestCart(db, { guestCartId: theirs.id, userId });
    expect(await quantities(cartId)).toEqual({});
    expect(await quantities(theirs.id)).toEqual({ "leather-tote-tan": 1 });
  });

  it("takes no new lines past the line limit, but still tops up lines already there", async () => {
    await db.execute(sql`
      insert into products (slug, name, category_id, audience, price, colour, colour_family, material, description, details, images, stock)
      select slug || '-merge-' || g, name, category_id, audience, price, colour, colour_family, material, description, details, images, 5
      from products cross join generate_series(1, 2) as g where slug not like '%-merge-%'`);
    const slugs = (await db.select({ slug: products.slug }).from(products).where(sql`${products.stock} > 0`).limit(BAG_LINE_LIMIT + 2)).map((row) => row.slug);
    const userId = await newUser();
    const own = await ensureCart(db, { userId, guestCartId: null });
    for (const slug of slugs.slice(0, BAG_LINE_LIMIT)) await addLine(db, own.id, slug, 1);
    const guest = await guestCart([
      [slugs[0], 1],
      [slugs[BAG_LINE_LIMIT], 1],
      [slugs[BAG_LINE_LIMIT + 1], 1],
    ]);
    await mergeGuestCart(db, { guestCartId: guest, userId });
    const bag = await quantities(own.id);
    expect(Object.keys(bag)).toHaveLength(BAG_LINE_LIMIT);
    expect(bag[slugs[0]]).toBe(2);
  });
});

describe("the sign-in hook", () => {
  it("merges the guest cookie's bag on sign-up, clears the cookie and sets the count", async () => {
    await setStock("leather-tote-tan", 5);
    const { auth } = await createTestAuth(db, { bagMerge: true });
    const guest = await guestCart([["leather-tote-tan", 2]]);
    const { headers, response } = await auth.api.signUpEmail({
      body: { name: "Ada", email: `hook-${++next}@example.test`, password: "correct-horse" },
      headers: new Headers({ cookie: `orra_cart=${signCartId(guest, SECRET)}` }),
      returnHeaders: true,
    });
    const setCookie = headers.getSetCookie().join("\n");
    expect(setCookie).toMatch(/orra_cart=;[^\n]*Max-Age=0/);
    expect(setCookie).toMatch(/orra_bag_count=2/);
    const [own] = await db.select().from(carts).where(eq(carts.userId, response.user.id));
    expect(await quantities(own.id)).toEqual({ "leather-tote-tan": 2 });
  });

  it("sets the count for a returning shopper's own bag, and ignores a forged cookie", async () => {
    await setStock("leather-tote-tan", 5);
    const { auth } = await createTestAuth(db, { bagMerge: true });
    const email = `hook-${++next}@example.test`;
    const { response } = await auth.api.signUpEmail({ body: { name: "Ada", email, password: "correct-horse" }, returnHeaders: true });
    const own = await ensureCart(db, { userId: response.user.id, guestCartId: null });
    await addLine(db, own.id, "leather-tote-tan", 3);
    const guest = await guestCart([["double-monk-shoe", 1]]);

    const { headers } = await auth.api.signInEmail({
      body: { email, password: "correct-horse" },
      headers: new Headers({ cookie: `orra_cart=${guest}.forged` }),
      returnHeaders: true,
    });
    expect(headers.getSetCookie().join("\n")).toMatch(/orra_bag_count=3/);
    expect(await quantities(own.id)).toEqual({ "leather-tote-tan": 3 });
  });

  it("changes nothing when sign-in fails", async () => {
    const { auth } = await createTestAuth(db, { bagMerge: true });
    const guest = await guestCart([["leather-tote-tan", 1]]);
    await expect(
      auth.api.signInEmail({ body: { email: "nobody@example.test", password: "wrong-password" }, headers: new Headers({ cookie: `orra_cart=${signCartId(guest, SECRET)}` }) }),
    ).rejects.toThrow();
    expect(await db.select().from(carts).where(eq(carts.id, guest))).toHaveLength(1);
  });
});
