import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { desc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { categories, products } from "@/db/schema";
import type { CollectionScope } from "./collections";
import { NEW_ARRIVALS_LIMIT, spotlightSlug } from "./merchandising";
import { productColumns } from "./product-columns";
import type { Category, Product } from "./types";

// Catalogue reads. Components depend on these signatures and the Product type, not on the
// table layout. Every read is cached (Cache Components) under the `catalog` tag with the
// `catalog` lifetime (next.config.ts): an edit shows on the first visit after the 5-minute
// refresh has run, or at once after updateTag("catalog") in a Server Action.
// queries-cache.test.ts checks that every exported read keeps its three cache lines.


function selectProducts() {
  return db.select(productColumns).from(products).innerJoin(categories, eq(products.categoryId, categories.id));
}

export async function getProduct(slug: string): Promise<Product | undefined> {
  "use cache";
  cacheTag("catalog");
  cacheLife("catalog");
  const [product] = await selectProducts().where(eq(products.slug, slug)).limit(1);
  return product;
}

export async function getAllProductSlugs(): Promise<string[]> {
  "use cache";
  cacheTag("catalog");
  cacheLife("catalog");
  const rows = await db.select({ slug: products.slug }).from(products);
  return rows.map((row) => row.slug);
}

/** Products in the given order (editorial picks); unknown slugs are skipped. */
export async function getProductsBySlugs(slugs: string[]): Promise<Product[]> {
  "use cache";
  cacheTag("catalog");
  cacheLife("catalog");
  if (slugs.length === 0) return [];
  const rows = await selectProducts().where(inArray(products.slug, slugs));
  const bySlug = new Map(rows.map((product) => [product.slug, product]));
  return slugs.flatMap((slug) => bySlug.get(slug) ?? []);
}

/** Newest products first. */
export async function getNewArrivals(limit: number = NEW_ARRIVALS_LIMIT): Promise<Product[]> {
  "use cache";
  cacheTag("catalog");
  cacheLife("catalog");
  return selectProducts().orderBy(desc(products.createdAt), products.id).limit(limit);
}

/**
 * A collection's products, newest first, with ties ordered by ascending product ID.
 * collections.ts decides which scope an address lists. New arrivals use scope.limit;
 * audience listings include unisex products, and category listings match the exact slug.
 * Returns an empty array when nothing matches, including unknown category slugs.
 * Database errors propagate to the caller.
 */
export async function getCollectionProducts(scope: CollectionScope): Promise<Product[]> {
  "use cache";
  cacheTag("catalog");
  cacheLife("catalog");
  switch (scope.kind) {
    case "new":
      return getNewArrivals(scope.limit);
    case "audience":
      return selectProducts()
        .where(inArray(products.audience, [scope.audience, "unisex"]))
        .orderBy(desc(products.createdAt), products.id);
    case "category":
      return selectProducts()
        .where(eq(categories.slug, scope.categorySlug))
        .orderBy(desc(products.createdAt), products.id);
  }
}

/** All categories, in the order they were created. */
export async function getCategories(): Promise<Category[]> {
  "use cache";
  cacheTag("catalog");
  cacheLife("catalog");
  return db.select({ slug: categories.slug, name: categories.name }).from(categories).orderBy(categories.id);
}

export async function getSpotlightProduct(): Promise<Product> {
  "use cache";
  cacheTag("catalog");
  cacheLife("catalog");
  const product = await getProduct(spotlightSlug);
  if (!product) throw new Error(`Spotlight product "${spotlightSlug}" is missing from the catalogue`);
  return product;
}

/** Same category first, then everything else (newest first); never the product itself. */
export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  "use cache";
  cacheTag("catalog");
  cacheLife("catalog");
  const sameCategory = sql`${categories.slug} = ${product.category.slug}`;
  return selectProducts()
    .where(ne(products.slug, product.slug))
    .orderBy(desc(sameCategory), desc(products.createdAt), products.id)
    .limit(limit);
}

