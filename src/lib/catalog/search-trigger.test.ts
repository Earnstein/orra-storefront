import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { categories, products } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { createTestDb } from "@/test/db";

// M5 writes stock (holds, orders). Only changes to searchable columns may rebuild a product's
// search columns; a stock change must leave them alone.

let db: SeedDatabase;

beforeAll(async () => {
  db = await createTestDb();
});

const SLUG = "leather-tote-tan";

async function searchText(): Promise<string> {
  const [row] = await db.select({ searchText: products.searchText }).from(products).where(eq(products.slug, SLUG));
  return row.searchText;
}

async function mark() {
  // search_text isn't a searchable column, so this write doesn't fire the trigger.
  await db.update(products).set({ searchText: "sentinel" }).where(eq(products.slug, SLUG));
  expect(await searchText()).toBe("sentinel");
}

describe("products_search_refresh", () => {
  it("doesn't rebuild the search columns when only stock changes", async () => {
    await mark();
    await db.update(products).set({ stock: sql`${products.stock} + 1` }).where(eq(products.slug, SLUG));
    expect(await searchText()).toBe("sentinel");
  });

  it("rebuilds them when the name changes", async () => {
    await mark();
    await db.update(products).set({ name: sql`${products.name}` }).where(eq(products.slug, SLUG));
    expect(await searchText()).toContain("leather");
  });

  it("rebuilds them when the product's category is renamed", async () => {
    await mark();
    const [row] = await db.select({ categoryId: products.categoryId }).from(products).where(eq(products.slug, SLUG));
    await db.update(categories).set({ name: sql`${categories.name} || ' renamed'` }).where(eq(categories.id, row.categoryId));
    expect(await searchText()).toContain("renamed");
  });
});
