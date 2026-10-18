import { inArray, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { products } from "@/db/schema";
import { products as seedProducts } from "@/db/seed/catalog";
import { getProductSummaries } from "@/lib/saved/queries";
import { emptyFilters, type ResultsQuery } from "./filters";
import { NEW_ARRIVALS_LIMIT, spotlightSlug } from "./merchandising";
import {
  getAllProductSlugs,
  getCollectionProducts,
  getNewArrivals,
  getProduct,
  getProductsBySlugs,
  getRelatedProducts,
  getSpotlightProduct,
} from "./queries";
import { getResults } from "./results";
import { getSuggestions } from "./suggest";

// Archived products (the admin's soft delete) leave every storefront read; their rows stay for
// orders, holds and restoring.
vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

// The newest product (seed order is newest first) and the spotlight, both in bags.
const newest = seedProducts[0];
const archived = [newest.slug, spotlightSlug];
const slugsOf = (list: { slug: string }[]) => list.map((product) => product.slug);
const query = (overrides: Partial<ResultsQuery>): ResultsQuery => ({
  scope: { kind: "new", limit: 24 },
  filters: emptyFilters(),
  sort: "newest",
  page: 1,
  ...overrides,
});

beforeAll(async () => {
  await db.update(products).set({ archivedAt: sql`now()` }).where(inArray(products.slug, archived));
});

describe("archived products", () => {
  it("have no product page and aren't prerendered", async () => {
    expect(await getProduct(newest.slug)).toBeUndefined();
    expect(await getAllProductSlugs()).not.toContain(newest.slug);
    expect(await getAllProductSlugs()).toHaveLength(seedProducts.length - archived.length);
  });

  it("leave editorial picks, new arrivals, listings and related products", async () => {
    expect(slugsOf(await getProductsBySlugs([newest.slug, seedProducts[2].slug]))).toEqual([seedProducts[2].slug]);
    const arrivals = await getNewArrivals();
    expect(arrivals).toHaveLength(NEW_ARRIVALS_LIMIT);
    expect(slugsOf(arrivals)).not.toContain(newest.slug);
    expect(slugsOf(await getCollectionProducts({ kind: "category", categorySlug: newest.category }))).not.toContain(newest.slug);
    expect(slugsOf(await getCollectionProducts({ kind: "audience", audience: "women" }))).not.toContain(newest.slug);
    const related = await getRelatedProducts((await getProduct(seedProducts[2].slug))!);
    expect(slugsOf(related).filter((slug) => archived.includes(slug))).toEqual([]);
  });

  it("leave results, their counts and the New in window, which still holds 24 live products", async () => {
    const results = await getResults(query({}));
    expect(results.products).toHaveLength(24);
    expect(slugsOf(results.products)).not.toContain(newest.slug);
    const inBags = await getResults(query({ scope: { kind: "category", categorySlug: "bags" } }));
    expect(inBags.total).toBe(seedProducts.filter((p) => p.category === "bags" && !archived.includes(p.slug)).length);
    const search = await getResults(query({ scope: { kind: "search", q: newest.name }, sort: "relevance" }));
    expect(slugsOf(search.products)).not.toContain(newest.slug);
    const counted = search.facets.category.reduce((total, option) => total + option.count, 0);
    expect(counted).toBe(search.total);
  });

  it("leave search suggestions and saved-item cards", async () => {
    expect(slugsOf((await getSuggestions(newest.name)).products)).not.toContain(newest.slug);
    expect(slugsOf(await getProductSummaries([newest.slug, seedProducts[2].slug]))).toEqual([seedProducts[2].slug]);
  });

  it("hand the spotlight to the newest live product when the spotlight is archived", async () => {
    expect((await getSpotlightProduct()).slug).toBe(seedProducts.find((p) => !archived.includes(p.slug))!.slug);
  });
});
