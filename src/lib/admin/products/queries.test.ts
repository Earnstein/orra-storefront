import { inArray, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { products } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { products as seedProducts } from "@/db/seed/catalog";
import { ADMIN_PAGE_SIZE, type AdminProductParams } from "@/lib/admin/table-params";
import { createTestDb } from "@/test/db";
import { getAdminProduct, listAdminProducts } from "./queries";

let db: SeedDatabase;
const base: AdminProductParams = { q: "", sort: "newest", dir: null, status: "active", page: 1 };
const list = (params: Partial<AdminProductParams>) => listAdminProducts(db, { ...base, ...params });
const archived = seedProducts.slice(0, 2).map((p) => p.slug);

beforeAll(async () => {
  db = await createTestDb();
  await db.update(products).set({ archivedAt: sql`now()` }).where(inArray(products.slug, archived));
});

describe("listAdminProducts", () => {
  it("pages active products 25 at a time, newest first, with the total", async () => {
    const first = await list({});
    expect(first.total).toBe(seedProducts.length - archived.length);
    expect(first.rows).toHaveLength(ADMIN_PAGE_SIZE);
    expect(first.rows[0].slug).toBe(seedProducts[2].slug);
    const second = await list({ page: 2 });
    expect(second.rows).toHaveLength(first.total - ADMIN_PAGE_SIZE);
    expect(new Set([...first.rows, ...second.rows].map((r) => r.slug)).size).toBe(first.total);
    expect((await list({ page: 99 })).page).toBe(2);
  });

  it("lists archived products on their own", async () => {
    const { rows, total } = await list({ status: "archived" });
    expect(total).toBe(2);
    expect(rows.map((r) => r.slug).sort()).toEqual([...archived].sort());
    expect(rows.every((r) => r.archived)).toBe(true);
  });

  it("searches by name and by slug, case-insensitively, with % and _ taken literally", async () => {
    const tote = await list({ q: "TOTE" });
    expect(tote.rows.length).toBeGreaterThan(0);
    expect(tote.rows.every((r) => /tote/i.test(r.name) || r.slug.includes("tote"))).toBe(true);
    const target = seedProducts[5];
    expect((await list({ q: target.slug })).rows.map((r) => r.slug)).toContain(target.slug);
    expect((await list({ q: "%" })).total).toBe(0);
    expect((await list({ q: "_" })).total).toBe(0);
  });

  it("sorts by name, price and stock both ways", async () => {
    const all = async (params: Partial<AdminProductParams>) => [...(await list(params)).rows, ...(await list({ ...params, page: 2 })).rows];
    const names = (await all({ sort: "name" })).map((r) => r.name.toLowerCase());
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    const prices = (await all({ sort: "price" })).map((r) => r.price);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
    const cheapest = (await all({ sort: "price", dir: "asc" })).map((r) => r.price);
    expect(cheapest).toEqual([...prices].reverse());
    const stock = (await all({ sort: "stock", dir: "asc" })).map((r) => r.stock);
    expect(stock).toEqual([...stock].sort((a, b) => a - b));
  });

  it("returns what a row shows: category, price, stock, held, the first photo", async () => {
    const [row] = (await list({ q: seedProducts[2].slug })).rows;
    expect(row).toMatchObject({ slug: seedProducts[2].slug, held: 0, archived: false });
    expect(typeof row.category).toBe("string");
    expect(row.image?.src).toMatch(/^https:\/\//);
  });
});

describe("getAdminProduct", () => {
  it("loads a product for the editor, archived ones too", async () => {
    const product = await getAdminProduct(db, archived[0]);
    expect(product).toMatchObject({ slug: archived[0], archived: true, held: 0, categorySlug: seedProducts[0].category });
    expect(product?.images.length).toBeGreaterThan(0);
    expect(await getAdminProduct(db, "no-such-product")).toBeUndefined();
  });
});
