import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { carts, user } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { createTestDb } from "@/test/db";
import { ensureCart, findCart } from "./cart";

let db: SeedDatabase;
let next = 0;

beforeAll(async () => {
  db = await createTestDb();
});

async function newUser(): Promise<string> {
  const id = `cart-user-${++next}`;
  await db.insert(user).values({ id, name: "Ada", email: `${id}@example.test` });
  return id;
}

describe("finding the shopper's cart", () => {
  it("creates a guest cart once, then finds it by its id", async () => {
    const created = await ensureCart(db, { userId: null, guestCartId: null });
    expect(created.created).toBe(true);
    expect(await ensureCart(db, { userId: null, guestCartId: created.id })).toEqual({ id: created.id, created: false });
    expect(await findCart(db, { userId: null, guestCartId: created.id })).toEqual({ id: created.id });
  });

  it("finds nothing for a guest without a cart, or with an id that doesn't exist", async () => {
    expect(await findCart(db, { userId: null, guestCartId: null })).toBeNull();
    expect(await findCart(db, { userId: null, guestCartId: "0b8f2c1e-6d2a-4c1b-9f53-2a7d1c0e9b44" })).toBeNull();
  });

  it("gives a signed-in shopper one cart, even when asked twice at once", async () => {
    const userId = await newUser();
    const [a, b] = await Promise.all([ensureCart(db, { userId, guestCartId: null }), ensureCart(db, { userId, guestCartId: null })]);
    expect(a.id).toBe(b.id);
    expect(await db.select().from(carts).where(eq(carts.userId, userId))).toHaveLength(1);
    expect(await findCart(db, { userId, guestCartId: null })).toEqual({ id: a.id });
  });

  it("never treats a user's cart as a guest cart", async () => {
    const userId = await newUser();
    const owned = await ensureCart(db, { userId, guestCartId: null });
    expect(await findCart(db, { userId: null, guestCartId: owned.id })).toBeNull();
    const fresh = await ensureCart(db, { userId: null, guestCartId: owned.id });
    expect(fresh.created).toBe(true);
    expect(fresh.id).not.toBe(owned.id);
  });

  it("uses the signed-in shopper's own cart, not the guest cart in the cookie", async () => {
    const guest = await ensureCart(db, { userId: null, guestCartId: null });
    const userId = await newUser();
    const own = await ensureCart(db, { userId, guestCartId: guest.id });
    expect(own.id).not.toBe(guest.id);
    expect(await findCart(db, { userId, guestCartId: guest.id })).toEqual({ id: own.id });
  });
});
