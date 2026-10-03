/**
 * Loads the initial catalogue (scripts/seed-data/catalog.ts) into the database:
 * `npm run db:seed`. Safe to re-run: rows are upserted by slug, which resets those
 * products' content and stock to the seed values. Products not in the seed are left alone.
 *
 * Builds its own client because src/db imports "server-only", which can't load outside Next.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "../src/db/schema";
import { categories, products } from "./seed-data/catalog";

config({ path: [".env.local", ".env"], quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");

const db = drizzle({ client: neon(url), schema, casing: "snake_case" });

async function main() {
  const categoryRows = await db
    .insert(schema.categories)
    .values(categories)
    .onConflictDoUpdate({ target: schema.categories.slug, set: { name: sql`excluded.name` } })
    .returning({ id: schema.categories.id, slug: schema.categories.slug });
  const categoryIds = new Map(categoryRows.map((row) => [row.slug, row.id]));

  // Newest first in the seed file, one minute apart, so "New this season" keeps that order.
  const now = Date.now();
  const productRows = products.map(({ category, ...product }, index) => {
    const categoryId = categoryIds.get(category);
    if (categoryId === undefined) throw new Error(`Product "${product.slug}" has unknown category "${category}"`);
    return { ...product, categoryId, createdAt: new Date(now - index * 60_000) };
  });

  await db
    .insert(schema.products)
    .values(productRows)
    .onConflictDoUpdate({
      target: schema.products.slug,
      set: {
        name: sql`excluded.name`,
        categoryId: sql`excluded.category_id`,
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

  console.log(`Seeded ${categoryRows.length} categories and ${productRows.length} products.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
