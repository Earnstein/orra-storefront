import { describe, expect, it, vi } from "vitest";

import { POPULAR_SEARCHES } from "@/content/search";
import { emptyFilters } from "./filters";
import { getResults } from "./results";
import { getSuggestions, SUGGESTION_LIMIT } from "./suggest";

// Real migrations and the real seed, in an in-memory Postgres.
vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

const search = (q: string) => getResults({ scope: { kind: "search", q }, filters: emptyFilters(), sort: "relevance", page: 1 });

describe("getSuggestions", () => {
  it("returns the most relevant products, the matching categories and the total", async () => {
    const suggestions = await getSuggestions("leath");
    const results = await search("leath");
    expect(suggestions.products.length).toBeLessThanOrEqual(SUGGESTION_LIMIT);
    expect(suggestions.products).toEqual(results.products.slice(0, SUGGESTION_LIMIT));
    expect(suggestions.total).toBe(results.total);
    expect(suggestions.total).toBeGreaterThan(SUGGESTION_LIMIT);
    expect(suggestions.categories.map((category) => category.slug)).toContain("bags");
    for (const category of suggestions.categories) expect(category.count).toBeGreaterThan(0);
  });

  it("orders categories by how many products match", async () => {
    const counts = (await getSuggestions("leather")).categories.map((category) => category.count);
    expect(counts).toEqual(counts.toSorted((a, b) => b - a));
  });

  it("returns nothing for empty or unsearchable text", async () => {
    for (const q of ["", "  ", "&|!", "the"]) {
      expect(await getSuggestions(q), JSON.stringify(q)).toEqual({ products: [], categories: [], total: 0 });
    }
  });
});

describe("POPULAR_SEARCHES", () => {
  it("each find products in the seed catalogue", async () => {
    expect(POPULAR_SEARCHES.length).toBeGreaterThan(0);
    for (const term of POPULAR_SEARCHES) expect((await search(term)).total, term).toBeGreaterThan(0);
  });
});
