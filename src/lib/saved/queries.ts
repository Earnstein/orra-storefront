import "server-only";

import { and, count, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { products, savedItems } from "@/db/schema";
import { liveProduct, productSummaryColumns } from "@/lib/catalog/product-columns";
import type { ProductSummary } from "@/lib/catalog/types";
import { SAVED_LIMIT } from "@/lib/saved/limits";

// Per-user reads, so not cached (unlike the catalogue reads in src/lib/catalog/queries.ts).
// Archived products stay saved (restoring brings them back) but are left out of every read.

/**
 * The user's saved product slugs, newest first, at most SAVED_LIMIT. The writes keep the cap, but
 * without a transaction a save racing a merge can leave one row over until the next save trims it.
 */
export async function getSavedSlugs(userId: string): Promise<string[]> {
  const rows = await db
    .select({ slug: products.slug })
    .from(savedItems)
    .innerJoin(products, eq(products.id, savedItems.productId))
    .where(and(eq(savedItems.userId, userId), liveProduct))
    .orderBy(desc(savedItems.createdAt), desc(savedItems.productId))
    .limit(SAVED_LIMIT);
  return rows.map((row) => row.slug);
}

/** How many items the user has saved. */
export async function countSavedItems(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(savedItems)
    .innerJoin(products, eq(products.id, savedItems.productId))
    .where(and(eq(savedItems.userId, userId), liveProduct));
  return row.total;
}

/** Card data for `slugs`, in the order given; unknown and archived slugs are left out. */
export async function getProductSummaries(slugs: string[]): Promise<ProductSummary[]> {
  if (slugs.length === 0) return [];
  const rows = await db.select(productSummaryColumns).from(products).where(and(inArray(products.slug, slugs), liveProduct));
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  return slugs.flatMap((slug) => bySlug.get(slug) ?? []);
}
