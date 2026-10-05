import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  activeFilters,
  defaultSort,
  emptyFilters,
  hiddenFacets,
  MAX_PAGE,
  normaliseQuery,
  optionState,
  PRICE_BANDS,
  sortsFor,
  type Filters,
  type ResultsQuery,
  type ResultsScope,
  withoutFilter,
} from "./filters";

const bags: ResultsScope = { kind: "category", categorySlug: "bags" };
const women: ResultsScope = { kind: "audience", audience: "women" };
const newIn: ResultsScope = { kind: "new", limit: 24 };
const search: ResultsScope = { kind: "search", q: "leather" };

function query(overrides: Partial<Omit<ResultsQuery, "filters">> & { filters?: Partial<Filters> } = {}): ResultsQuery {
  return {
    scope: bags,
    sort: "newest",
    page: 1,
    ...overrides,
    filters: { ...emptyFilters(), ...overrides.filters },
  };
}

describe("price bands", () => {
  it("cover every price in integer cents without gaps or overlaps", () => {
    expect(PRICE_BANDS.map((band) => [band.value, band.min, band.max])).toEqual([
      ["under-500", 0, 49_999],
      ["500-1000", 50_000, 99_999],
      ["1000-2000", 100_000, 199_999],
      ["2000-plus", 200_000, null],
    ]);
    expect(PRICE_BANDS.map((band) => band.label)).toEqual(["Under $500", "$500–$1,000", "$1,000–$2,000", "$2,000+"]);
  });
});

describe("facets and sorts per scope", () => {
  it("hide filters the page already fixes", () => {
    expect(hiddenFacets(women)).toEqual(expect.arrayContaining(["audience", "category"]));
    expect(hiddenFacets(newIn)).toEqual(expect.arrayContaining(["newIn", "category"]));
    expect(hiddenFacets(bags)).toEqual(["category"]);
    expect(hiddenFacets(search)).toEqual([]);
  });

  it("offer relevance only on search, where it is the default", () => {
    expect(sortsFor(bags)).toEqual(["newest", "price-asc", "price-desc"]);
    expect(sortsFor(search)).toEqual(["relevance", "newest", "price-asc", "price-desc"]);
    expect(defaultSort(bags)).toBe("newest");
    expect(defaultSort(search)).toBe("relevance");
  });
});

describe("normaliseQuery", () => {
  it("sorts and deduplicates values, so equal states share a cache entry", () => {
    expect(normaliseQuery(query({ filters: { colour: ["red", "black", "red"], price: ["2000-plus", "under-500"] } })).filters)
      .toMatchObject({ colour: ["black", "red"], price: ["under-500", "2000-plus"] });
  });

  it("drops filters on hidden facets and sorts the page doesn't offer", () => {
    const normal = normaliseQuery(query({ scope: women, sort: "relevance", filters: { audience: ["men"], category: ["bags"] } }));
    expect(normal.filters.audience).toEqual([]);
    expect(normal.filters.category).toEqual([]);
    expect(normal.sort).toBe("newest");
  });

  it("clamps the page to a whole number between 1 and MAX_PAGE", () => {
    expect(normaliseQuery(query({ page: -3 })).page).toBe(1);
    expect(normaliseQuery(query({ page: 0 })).page).toBe(1);
    expect(normaliseQuery(query({ page: 2.7 })).page).toBe(2);
    expect(normaliseQuery(query({ page: 1e20 })).page).toBe(MAX_PAGE);
    expect(normaliseQuery(query({ page: Infinity })).page).toBe(1);
    expect(normaliseQuery(query({ page: Number.NaN })).page).toBe(1);
  });

  it("drops values outside each filter's vocabulary", () => {
    const loose = query({
      filters: {
        colour: ["black", "purplish"] as Filters["colour"],
        material: ["wool", "plastic"] as Filters["material"],
        price: ["cheap", "under-500"] as Filters["price"],
      },
      scope: { kind: "search", q: "x" },
      sort: "relevance",
    });
    (loose.filters.audience as string[]).push("kids", "women");
    expect(normaliseQuery(loose).filters).toMatchObject({
      colour: ["black"],
      material: ["wool"],
      price: ["under-500"],
      audience: ["women"],
    });
  });

  it("builds the cache key from fixed fields only", () => {
    const messy = { ...query({ scope: { categorySlug: "bags", kind: "category", extra: 1 } as unknown as ResultsScope, tab: "shoes" }) };
    expect(normaliseQuery(messy)).toEqual(normaliseQuery(query({ scope: bags })));
    expect(normaliseQuery(query({ scope: women, tab: "bags" })).tab).toBe("bags"); // tabs only exist on New, Women and Men
    const variants = ["Tote", "tote", " tote! "].map((q) => normaliseQuery(query({ scope: { kind: "search", q }, sort: "relevance" })).scope);
    expect(new Set(variants.map((scope) => JSON.stringify(scope))).size).toBe(1);
  });

  it("reduces the search text to its words, capped at 100 characters", () => {
    const normal = normaliseQuery(query({ scope: { kind: "search", q: `  ${"x".repeat(150)}  ` }, sort: "relevance" }));
    expect(normal.scope).toEqual({ kind: "search", q: "x".repeat(100) });
    expect(normaliseQuery(query({ scope: { kind: "search", q: "&|!" }, sort: "relevance" })).scope).toEqual({ kind: "search", q: "" });
  });

  it("is idempotent", () => {
    const once = normaliseQuery(query({ filters: { colour: ["red", "black"], stock: true } }));
    expect(normaliseQuery(once)).toEqual(once);
  });
});

describe("filter helpers", () => {
  it("count active filter values", () => {
    expect(activeFilterCount(emptyFilters())).toBe(0);
    expect(activeFilterCount({ ...emptyFilters(), colour: ["black", "red"], stock: true, newIn: true })).toBe(4);
  });

  it("keep a selected option enabled even when its count drops to zero", () => {
    expect(optionState(3, false)).toBe("enabled");
    expect(optionState(0, false)).toBe("disabled");
    expect(optionState(0, true)).toBe("enabled");
  });
});

describe("activeFilters and withoutFilter", () => {
  const filters: Filters = { ...emptyFilters(), colour: ["black", "brown"], price: ["under-500"], stock: true, newIn: true };

  it("lists every active value, switches last", () => {
    expect(activeFilters(filters)).toEqual([
      { key: "colour", value: "black" },
      { key: "colour", value: "brown" },
      { key: "price", value: "under-500" },
      { key: "stock", value: "in" },
      { key: "newIn", value: "1" },
    ]);
    expect(activeFilters(filters)).toHaveLength(activeFilterCount(filters));
  });

  it("removes one value, or turns a switch off", () => {
    expect(withoutFilter(filters, { key: "colour", value: "black" })).toEqual({ ...filters, colour: ["brown"] });
    expect(withoutFilter(filters, { key: "stock", value: "in" })).toEqual({ ...filters, stock: false });
    expect(withoutFilter(filters, { key: "newIn", value: "1" })).toEqual({ ...filters, newIn: false });
  });
});
