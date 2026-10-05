import { describe, expect, it, vi } from "vitest";

import { products as seedProducts } from "@/db/seed/catalog";
import { emptyFilters, type Filters, type ResultsQuery, type ResultsScope } from "./filters";
import { getResults, RESULTS_PAGE_SIZE, type Results } from "./results";

// Real migrations and the real seed, in an in-memory Postgres.
vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

const newScope: ResultsScope = { kind: "new", limit: 24 };
const women: ResultsScope = { kind: "audience", audience: "women" };
const bags: ResultsScope = { kind: "category", categorySlug: "bags" };

function q(overrides: Partial<Omit<ResultsQuery, "filters">> & { filters?: Partial<Filters> } = {}): ResultsQuery {
  return { scope: newScope, sort: "newest", page: 1, ...overrides, filters: { ...emptyFilters(), ...overrides.filters } };
}
const search = (text: string) => q({ scope: { kind: "search", q: text }, sort: "relevance" });
const slugs = (results: Results) => results.products.map((product) => product.slug);
const seed = (slug: string) => seedProducts.find((product) => product.slug === slug)!;
const count = (results: Results, facet: keyof Results["facets"], value: string) =>
  results.facets[facet].find((option) => option.value === value)?.count;

describe("getResults", () => {
  it("lists a scope's products, newest first", async () => {
    const results = await getResults(q({ scope: bags }));
    expect(slugs(results)).toEqual(seedProducts.filter((p) => p.category === "bags").map((p) => p.slug));
    expect(results.total).toBe(results.products.length);
  });

  it("ORs values within a filter and ANDs across filters", async () => {
    const results = await getResults(q({ filters: { colour: ["black", "brown"], material: ["leather"] } }));
    expect(results.total).toBeGreaterThan(0);
    for (const slug of slugs(results)) {
      expect(["black", "brown"]).toContain(seed(slug).colourFamily);
      expect(seed(slug).material).toBe("leather");
    }
  });

  it("filters by price band, audience (with unisex), stock and new in", async () => {
    const cheap = await getResults(q({ scope: bags, filters: { price: ["under-500", "2000-plus"] } }));
    for (const product of cheap.products) expect(product.price < 50_000 || product.price >= 200_000).toBe(true);
    const men = await getResults(q({ scope: { kind: "search", q: "leather" }, filters: { audience: ["men"] } }));
    for (const slug of slugs(men)) expect(["men", "unisex"]).toContain(seed(slug).audience);
    const inStock = await getResults(q({ filters: { stock: true } }));
    expect(inStock.products.every((product) => product.stock > 0)).toBe(true);
    const fresh = await getResults(q({ scope: bags, filters: { newIn: true } }));
    const newest = new Set(seedProducts.slice(0, 24).map((p) => p.slug));
    expect(slugs(fresh).every((slug) => newest.has(slug))).toBe(true);
  });

  it("counts each facet without its own selection, but with the others", async () => {
    const black = await getResults(q({ filters: { colour: ["black"] } }));
    expect(count(black, "colour", "brown")).toBeGreaterThan(0); // still selectable
    const blackLeather = await getResults(q({ filters: { colour: ["black"], material: ["leather"] } }));
    const brownLeather = (await getResults(q({ filters: { colour: ["brown"], material: ["leather"] } }))).total;
    expect(count(blackLeather, "colour", "brown")).toBe(brownLeather);
  });

  it("keeps a selected option listed when its count is zero", async () => {
    const results = await getResults(q({ scope: bags, filters: { material: ["cashmere"] } }));
    expect(results.total).toBe(0);
    expect(count(results, "material", "cashmere")).toBe(0);
  });

  it("hides the facets the page fixes", async () => {
    const results = await getResults(q({ scope: women }));
    expect(results.facets.audience).toEqual([]);
    expect(results.facets.category).toEqual([]);
  });

  it("sorts by price both ways, with ties broken consistently", async () => {
    const asc = (await getResults(q({ scope: women, sort: "price-asc", page: 2 }))).products.map((p) => p.price);
    expect(asc).toEqual(asc.toSorted((a, b) => a - b));
    const desc = (await getResults(q({ scope: women, sort: "price-desc", page: 2 }))).products.map((p) => p.price);
    expect(desc).toEqual(desc.toSorted((a, b) => b - a));
  });

  it("returns the first page × 24 products and clamps the page", async () => {
    const total = seedProducts.filter((p) => p.audience !== "men").length;
    const first = await getResults(q({ scope: women }));
    expect(first).toMatchObject({ total, page: 1, pageCount: Math.ceil(total / RESULTS_PAGE_SIZE) });
    expect(first.products).toHaveLength(RESULTS_PAGE_SIZE);
    expect((await getResults(q({ scope: women, page: 2 }))).products).toHaveLength(Math.min(total, 48));
    expect((await getResults(q({ scope: women, page: 99 }))).page).toBe(Math.ceil(total / RESULTS_PAGE_SIZE));
  });

  it("searches names first, mid-word, with typos and word endings", async () => {
    expect(slugs(await getResults(search("tote")))[0]).toBe("leather-tote-tan");
    expect(slugs(await getResults(search("lea")))).toContain("leather-tote-tan");
    expect(slugs(await getResults(search("lether")))).toContain("leather-tote-tan");
    expect(slugs(await getResults(search("boots")))).toContain("slouch-boot-black");
    expect(slugs(await getResults(search("black boot")))).toContain("slouch-boot-black");
  });

  it("finds nothing, without an error, for a nonsense or empty query", async () => {
    expect((await getResults(search("zzqxv"))).total).toBe(0);
    expect((await getResults(search("&|!:*()"))).total).toBe(0);
    expect((await getResults(search(""))).total).toBe(0);
  });
});
