import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { categories, products } from "@/db/schema";
import { products as seedProducts } from "@/db/seed/catalog";
import { createTestDb } from "@/test/db";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/** Raw SQL rows from the test database (its execute() result type is driver-generic). */
async function rows<T>(db: TestDb, query: ReturnType<typeof sql>): Promise<T[]> {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows;
}

async function fullText(db: TestDb, query: string): Promise<string[]> {
  const found = await rows<{ slug: string }>(
    db,
    sql`select slug from products where search @@ to_tsquery('english', ${query}) order by slug`,
  );
  return found.map((row) => row.slug);
}

async function searchText(db: TestDb, slug: string): Promise<string> {
  const [row] = await db.select({ text: products.searchText }).from(products).where(eq(products.slug, slug));
  return row.text;
}

describe("product search columns", () => {
  it("are filled for every seeded product", async () => {
    const db = await createTestDb();
    expect(await rows(db, sql`select slug from products where search = ''::tsvector or search_text = ''`)).toEqual([]);
    expect(await searchText(db, "leather-tote-tan")).toContain("leather");
    expect(await searchText(db, "leather-tote-tan")).toContain("bags"); // the category's name, lower-cased
  });

  it("weight the name above the description", async () => {
    const db = await createTestDb();
    const [top] = await rows<{ slug: string }>(
      db,
      sql`select slug from products where search @@ to_tsquery('english', 'tote')
          order by ts_rank_cd(search, to_tsquery('english', 'tote')) desc, slug limit 1`,
    );
    expect(top.slug).toBe("leather-tote-tan");
  });

  it("follow a product edit", async () => {
    const db = await createTestDb();
    await db.update(products).set({ name: "Moonlit clutch" }).where(eq(products.slug, "leather-tote-tan"));
    expect(await fullText(db, "moonlit")).toEqual(["leather-tote-tan"]);
    expect(await searchText(db, "leather-tote-tan")).toContain("moonlit clutch");
  });

  it("follow a category rename", async () => {
    const db = await createTestDb();
    await db.update(categories).set({ name: "Carryalls" }).where(eq(categories.slug, "bags"));
    const bags = seedProducts.filter((p) => p.category === "bags").map((p) => p.slug).toSorted();
    expect(await fullText(db, "carryalls")).toEqual(bags);
    expect(await searchText(db, bags[0])).toContain("carryalls");
  });
});
