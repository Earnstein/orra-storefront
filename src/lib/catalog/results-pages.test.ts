import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { emptyFilters, MAX_RESTORE_PAGES, type ResultsQuery } from "./filters";
import { getResults, getResultsPage, RESULTS_PAGE_SIZE } from "./results";

// Paging at a size the seed doesn't reach: the 48 seed products plus 6 copies of each, older than
// the originals, make 336 products (14 pages).
vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

const COPIES = 6;

beforeAll(async () => {
  await db.execute(sql`
    insert into products (slug, name, category_id, audience, price, colour, colour_family, material, description, details, images, stock, created_at)
    select slug || '-copy-' || g, name, category_id, audience, price, colour, colour_family, material, description, details, images, stock,
      created_at - make_interval(days => 30 * g)
    from products cross join generate_series(1, ${COPIES}) as g`);
});

const query = (page: number): ResultsQuery => ({
  scope: { kind: "new", limit: 10_000 },
  filters: emptyFilters(),
  sort: "price-asc",
  page,
});
const slugs = (products: { slug: string }[]) => products.map((product) => product.slug);

describe("results pages", () => {
  it("restores at most MAX_RESTORE_PAGES pages in one read", async () => {
    const results = await getResults(query(12));
    expect(results.pageCount).toBeGreaterThan(MAX_RESTORE_PAGES);
    expect(results.page).toBe(MAX_RESTORE_PAGES);
    expect(results.products).toHaveLength(MAX_RESTORE_PAGES * RESULTS_PAGE_SIZE);
  });

  it("returns one page's products on their own, continuing the restored list", async () => {
    const restored = await getResults(query(MAX_RESTORE_PAGES));
    const next = await getResultsPage(query(MAX_RESTORE_PAGES + 1));
    expect(next).toMatchObject({ page: MAX_RESTORE_PAGES + 1, total: restored.total, pageCount: restored.pageCount });
    expect(next.products).toHaveLength(RESULTS_PAGE_SIZE);

    const all = await getResults(query(1));
    const pages = [all.products];
    for (let page = 2; page <= all.pageCount; page++) pages.push((await getResultsPage(query(page))).products);
    const joined = slugs(pages.flat());
    expect(joined).toHaveLength(all.total);
    expect(new Set(joined).size).toBe(all.total);
    expect(joined.slice(0, MAX_RESTORE_PAGES * RESULTS_PAGE_SIZE)).toEqual(slugs(restored.products));
  });

  it("returns an empty last page past the end", async () => {
    const results = await getResultsPage(query(99));
    expect(results.products).toEqual([]);
  });
});
