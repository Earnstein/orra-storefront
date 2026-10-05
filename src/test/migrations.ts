import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";

import { categories, products } from "@/db/seed/catalog";

/** ./drizzle, resolved from this file rather than the working directory. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

/** Migration tags in the order drizzle applies them (meta/_journal.json). */
export function migrationTags(): string[] {
  const journal = JSON.parse(readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, "utf8")) as {
    entries: { tag: string }[];
  };
  return journal.entries.map((entry) => entry.tag);
}

/**
 * Runs the given migrations' SQL directly, statement by statement, so a test can stop between two
 * migrations. (drizzle's migrator only runs everything.)
 */
export async function applyMigrations(client: PGlite, tags: readonly string[]): Promise<void> {
  for (const tag of tags) {
    const sql = readFileSync(`${MIGRATIONS_FOLDER}/${tag}.sql`, "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await client.exec(statement);
    }
  }
}

/**
 * The catalogue as it was before M2: the seed's categories and its first 9 products, using only
 * the columns of 0000_catalog, plus one bare product per extra slug (a row no backfill names).
 */
export async function insertLegacyCatalogue(client: PGlite, extraSlugs: string[] = []): Promise<void> {
  const categoryIds = new Map<string, number>();
  for (const category of categories) {
    const { rows } = await client.query<{ id: number }>("insert into categories (slug, name) values ($1, $2) returning id", [
      category.slug,
      category.name,
    ]);
    categoryIds.set(category.slug, rows[0].id);
  }

  const legacy = [
    ...products.slice(0, 9),
    ...extraSlugs.map((slug) => ({ ...products[0], slug, name: slug, details: [], images: [] })),
  ];
  for (const product of legacy) {
    await client.query(
      `insert into products (slug, name, category_id, price, colour, description, details, images, stock)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)`,
      [
        product.slug,
        product.name,
        categoryIds.get(product.category),
        product.price,
        product.colour,
        product.description,
        JSON.stringify(product.details),
        JSON.stringify(product.images),
        product.stock,
      ],
    );
  }
}
