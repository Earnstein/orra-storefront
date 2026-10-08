import "server-only";

import { and, count, desc, eq, inArray, notInArray } from "drizzle-orm";

import { db } from "@/db";
import { products, savedItems } from "@/db/schema";
import { SAVED_LIMIT } from "@/lib/saved/limits";
import { getSavedSlugs } from "@/lib/saved/queries";

// Writes to a user's saved items. Callers check the session and validate the slugs first
// (src/lib/saved/actions.ts). The Neon HTTP driver has no interactive transactions, so each step is
// its own statement; every step is safe to repeat, so concurrent requests (two tabs) can't
// duplicate rows, and the cap is re-applied after each save.

/** Product ids for `slugs`, in the order given; unknown slugs are left out. */
async function productIds(slugs: string[]): Promise<{ slug: string; id: number }[]> {
  if (slugs.length === 0) return [];
  const rows = await db.select({ slug: products.slug, id: products.id }).from(products).where(inArray(products.slug, slugs));
  const idBySlug = new Map(rows.map((row) => [row.slug, row.id]));
  return [...new Set(slugs)].flatMap((slug) => (idBySlug.has(slug) ? [{ slug, id: idBySlug.get(slug)! }] : []));
}

/**
 * Saves `slugs` (unknown ones are skipped; already-saved ones keep their place), then keeps the
 * newest SAVED_LIMIT by deleting the oldest. Returns the saved slugs, newest first.
 */
export async function saveSlugs(userId: string, slugs: string[]): Promise<string[]> {
  const found = await productIds(slugs);
  if (found.length > 0) {
    const now = Date.now();
    await db
      .insert(savedItems)
      .values(found.map(({ id }, i) => ({ userId, productId: id, createdAt: new Date(now + i) })))
      .onConflictDoNothing();
    const keep = db
      .select({ productId: savedItems.productId })
      .from(savedItems)
      .where(eq(savedItems.userId, userId))
      .orderBy(desc(savedItems.createdAt), desc(savedItems.productId))
      .limit(SAVED_LIMIT);
    await db.delete(savedItems).where(and(eq(savedItems.userId, userId), notInArray(savedItems.productId, keep)));
  }
  return getSavedSlugs(userId);
}

/** Removes one saved slug (an unknown or unsaved one changes nothing). Returns the saved slugs. */
export async function unsaveSlug(userId: string, slug: string): Promise<string[]> {
  const [found] = await productIds([slug]);
  if (found) await db.delete(savedItems).where(and(eq(savedItems.userId, userId), eq(savedItems.productId, found.id)));
  return getSavedSlugs(userId);
}

/**
 * Merges a browser's saved slugs (oldest first, as `mergeBatch` gives them) into the account.
 * Unlike saveSlugs it never removes the account's items: it adds new ones, in order, only while
 * there's room. Already-saved slugs count as merged; unknown ones are dropped; `unmerged` lists the
 * known ones that didn't fit, which stay in the browser for a later sync.
 */
export async function mergeSlugs(userId: string, slugs: string[]): Promise<{ slugs: string[]; unmerged: string[] }> {
  const found = await productIds(slugs);
  const savedIds = new Set(
    (
      await db
        .select({ productId: savedItems.productId })
        .from(savedItems)
        .where(and(eq(savedItems.userId, userId), inArray(savedItems.productId, found.length > 0 ? found.map(({ id }) => id) : [-1])))
    ).map((row) => row.productId),
  );
  const fresh = found.filter(({ id }) => !savedIds.has(id));
  const [{ total }] = await db.select({ total: count() }).from(savedItems).where(eq(savedItems.userId, userId));
  const room = Math.max(0, SAVED_LIMIT - total);
  const fits = fresh.slice(0, room);
  if (fits.length > 0) {
    // Newer than everything already saved, keeping the browser's order (its newest last).
    const now = Date.now();
    await db
      .insert(savedItems)
      .values(fits.map(({ id }, i) => ({ userId, productId: id, createdAt: new Date(now + i) })))
      .onConflictDoNothing();
  }
  return { slugs: await getSavedSlugs(userId), unmerged: fresh.slice(room).map(({ slug }) => slug) };
}
