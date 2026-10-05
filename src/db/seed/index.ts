import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "../schema";
import { categories, products } from "./catalog";

/** Any Drizzle Postgres database with this app's schema: Neon in scripts and builds, PGlite in tests. */
export type SeedDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Upserts the initial catalogue (./catalog.ts) by slug: categories, then products. Safe to re-run;
 * it resets those products' content and stock to the seed values and leaves other products alone.
 * Products are given created_at times one minute apart, newest first in seed order, so
 * "New this season" keeps the seed's order.
 */
export async function seedCatalog(db: SeedDatabase, now = new Date()): Promise<{ categories: number; products: number }> {
  const categoryRows = await db
    .insert(schema.categories)
    .values(categories)
    .onConflictDoUpdate({ target: schema.categories.slug, set: { name: sql`excluded.name` } })
    .returning({ id: schema.categories.id, slug: schema.categories.slug });
  const categoryIds = new Map(categoryRows.map((row) => [row.slug, row.id]));

  const productRows = products.map(({ category, ...product }, index) => {
    const categoryId = categoryIds.get(category);
    if (categoryId === undefined) throw new Error(`Product "${product.slug}" has unknown category "${category}"`);
    return { ...product, categoryId, createdAt: new Date(now.getTime() - index * 60_000) };
  });

  await db
    .insert(schema.products)
    .values(productRows)
    .onConflictDoUpdate({
      target: schema.products.slug,
      set: {
        name: sql`excluded.name`,
        categoryId: sql`excluded.category_id`,
        audience: sql`excluded.audience`,
        price: sql`excluded.price`,
        colour: sql`excluded.colour`,
        description: sql`excluded.description`,
        details: sql`excluded.details`,
        images: sql`excluded.images`,
        stock: sql`excluded.stock`,
        createdAt: sql`excluded.created_at`,
        updatedAt: sql`now()`,
      },
    });

  return { categories: categoryRows.length, products: productRows.length };
}
