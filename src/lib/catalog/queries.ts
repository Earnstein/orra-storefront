import "server-only";
import { cache } from "react";
import { desc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { categories, products } from "@/db/schema";
import type { CollectionScope } from "./collections";
import { NEW_ARRIVALS_LIMIT, spotlightSlug } from "./merchandising";
import type { Category, Product } from "./types";

// Catalogue reads. Components depend on these signatures and the Product type, not on the
// table layout.

const productColumns = {
  slug: products.slug,
  name: products.name,
  price: products.price,
  colour: products.colour,
  description: products.description,
  details: products.details,
  stock: products.stock,
  images: products.images,
  category: { slug: categories.slug, name: categories.name },
};

function selectProducts() {
  return db.select(productColumns).from(products).innerJoin(categories, eq(products.categoryId, categories.id));
}

/** Cached per request, so generateMetadata and the page share one query. */
export const getProduct = cache(async (slug: string): Promise<Product | undefined> => {
  const [product] = await selectProducts().where(eq(products.slug, slug)).limit(1);
  return product;
});

export async function getAllProductSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: products.slug }).from(products);
  return rows.map((row) => row.slug);
}

/** Newest products first. Cached per request, so a page and its metadata share one query. */
export const getNewArrivals = cache(async (limit: number = NEW_ARRIVALS_LIMIT): Promise<Product[]> => {
  return selectProducts().orderBy(desc(products.createdAt), products.id).limit(limit);
});

/**
 * A collection's products, newest first, with ties ordered by ascending product ID.
 * collections.ts decides which scope an address lists. New arrivals use scope.limit;
 * audience listings include unisex products, and category listings match the exact slug.
 * Returns an empty array when nothing matches, including unknown category slugs.
 * Database errors propagate to the caller.
 */
export async function getCollectionProducts(scope: CollectionScope): Promise<Product[]> {
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
export const getCategories = cache(async (): Promise<Category[]> => {
  return db.select({ slug: categories.slug, name: categories.name }).from(categories).orderBy(categories.id);
});

export async function getSpotlightProduct(): Promise<Product> {
  const product = await getProduct(spotlightSlug);
  if (!product) throw new Error(`Spotlight product "${spotlightSlug}" is missing from the catalogue`);
  return product;
}

/** Same category first, then everything else (newest first); never the product itself. */
export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  const sameCategory = sql`${categories.slug} = ${product.category.slug}`;
  return selectProducts()
    .where(ne(products.slug, product.slug))
    .orderBy(desc(sameCategory), desc(products.createdAt), products.id)
    .limit(limit);
}

