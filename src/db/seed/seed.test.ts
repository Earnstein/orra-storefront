import { count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { categories, products } from "@/db/schema";
import { RESERVED_COLLECTION_SLUGS } from "@/lib/catalog/collections";
import { createTestDb } from "@/test/db";
import { seedCatalog } from ".";
import { categories as seedCategories } from "./catalog";

describe("seed categories", () => {
  it("don't take a reserved collection slug (new, women, men)", () => {
    const reserved: readonly string[] = RESERVED_COLLECTION_SLUGS;
    expect(seedCategories.filter((category) => reserved.includes(category.slug))).toEqual([]);
  });
});

describe("seedCatalog", () => {
  it("is idempotent", async () => {
    const db = await createTestDb(); // seeded once already
    await seedCatalog(db);
    const [{ value: categoryCount }] = await db.select({ value: count() }).from(categories);
    const [{ value: productCount }] = await db.select({ value: count() }).from(products);
    expect([categoryCount, productCount]).toEqual([5, 9]);
  });
});

describe("catalogue constraints", () => {
  it("rejects negative stock", async () => {
    const db = await createTestDb();
    await expect(db.update(products).set({ stock: -1 }).where(eq(products.slug, "floral-pump"))).rejects.toThrow();
    const [pump] = await db.select({ stock: products.stock }).from(products).where(eq(products.slug, "floral-pump"));
    expect(pump.stock).toBe(3);
  });

  it("blocks deleting a category that has products", async () => {
    const db = await createTestDb();
    await expect(db.delete(categories).where(eq(categories.slug, "bags"))).rejects.toThrow();
    const bags = await db.select().from(categories).where(eq(categories.slug, "bags"));
    expect(bags).toHaveLength(1);
  });
});
