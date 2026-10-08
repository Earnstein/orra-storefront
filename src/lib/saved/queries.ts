import "server-only";

import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { products, savedItems } from "@/db/schema";
import { productSummaryColumns } from "@/lib/catalog/product-columns";
import type { ProductSummary } from "@/lib/catalog/types";

// Per-user reads, so not cached (unlike the catalogue reads in src/lib/catalog/queries.ts).

/** The user's saved product slugs, newest first. */
export async function getSavedSlugs(userId: string): Promise<string[]> {
  const rows = await db
    .select({ slug: products.slug })
    .from(savedItems)
    .innerJoin(products, eq(products.id, savedItems.productId))
    .where(eq(savedItems.userId, userId))
    .orderBy(desc(savedItems.createdAt), desc(savedItems.productId));
  return rows.map((row) => row.slug);
}

/** Card data for `slugs`, in the order given; unknown slugs are left out. */
export async function getProductSummaries(slugs: string[]): Promise<ProductSummary[]> {
  if (slugs.length === 0) return [];
  const rows = await db.select(productSummaryColumns).from(products).where(inArray(products.slug, slugs));
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  return slugs.flatMap((slug) => bySlug.get(slug) ?? []);
}
