import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { carts } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";

/** Who the bag belongs to: a signed-in user, or the guest cart named by a verified cookie. */
export type CartRef = { userId: string | null; guestCartId: string | null };

/** The shopper's cart, without creating one. A signed-in shopper always uses their own cart. */
export async function findCart(db: SeedDatabase, { userId, guestCartId }: CartRef): Promise<{ id: string } | null> {
  if (userId) {
    const [cart] = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, userId));
    return cart ?? null;
  }
  if (!guestCartId) return null;
  const [cart] = await db
    .select({ id: carts.id })
    .from(carts)
    .where(and(eq(carts.id, guestCartId), isNull(carts.userId)));
  return cart ?? null;
}

/**
 * The shopper's cart, created on first need. A user's cart is created with `ON CONFLICT DO
 * NOTHING`, so two requests at once still make one. A guest cookie that names no guest cart
 * (deleted, merged, or a user's) gets a fresh guest cart; `created` says to set the cookie.
 */
export async function ensureCart(db: SeedDatabase, ref: CartRef): Promise<{ id: string; created: boolean }> {
  const found = await findCart(db, ref);
  if (found) return { id: found.id, created: false };
  if (ref.userId) {
    const [inserted] = await db.insert(carts).values({ userId: ref.userId }).onConflictDoNothing({ target: carts.userId }).returning({ id: carts.id });
    if (inserted) return { id: inserted.id, created: true };
    const again = await findCart(db, ref);
    if (!again) throw new Error("cart: user cart missing after conflict");
    return { id: again.id, created: false };
  }
  const [inserted] = await db.insert(carts).values({}).returning({ id: carts.id });
  return { id: inserted.id, created: true };
}
