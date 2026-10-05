import type { ColourFamily, Material } from "@/db/schema/catalog";
import type { CollectionScope } from "./collections";
import { buildSearchQuery } from "./search";
import { COLOUR_FAMILIES, MATERIALS } from "./vocabulary";

/** Highest page a request can ask for (2,400 products); keeps a hand-edited URL from fetching everything. */
export const MAX_PAGE = 100;

// What a results request can ask for, and the rules that keep equal requests equal (so they share
// one cache entry) and drop what a page doesn't offer.

export const SORTS = ["newest", "price-asc", "price-desc", "relevance"] as const;
export type Sort = (typeof SORTS)[number];

export const SORT_LABELS: Record<Sort, string> = {
  newest: "Newest",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  relevance: "Relevance",
};

export const PRICE_BANDS = [
  { value: "under-500", label: "Under $500", min: 0, max: 49_999 },
  { value: "500-1000", label: "$500–$1,000", min: 50_000, max: 99_999 },
  { value: "1000-2000", label: "$1,000–$2,000", min: 100_000, max: 199_999 },
  { value: "2000-plus", label: "$2,000+", min: 200_000, max: null },
] as const satisfies readonly { value: string; label: string; min: number; max: number | null }[];
export type PriceBand = (typeof PRICE_BANDS)[number]["value"];

export type Filters = {
  category: string[];
  audience: ("women" | "men")[];
  colour: ColourFamily[];
  material: Material[];
  price: PriceBand[];
  stock: boolean;
  newIn: boolean;
};

export type ResultsScope = CollectionScope | { kind: "search"; q: string };

export type ResultsQuery = {
  scope: ResultsScope;
  /** A listing tab's category slug (/collections/<new|women|men>/<tab>). */
  tab?: string;
  filters: Filters;
  sort: Sort;
  /** 1-based; page N shows the first N × 24 results. */
  page: number;
};

export type FacetKey = "category" | "audience" | "colour" | "material" | "price" | "stock" | "newIn";

export function emptyFilters(): Filters {
  return { category: [], audience: [], colour: [], material: [], price: [], stock: false, newIn: false };
}

/**
 * Filters a page already fixes, so they aren't offered. Listings choose categories with path tabs,
 * so the category filter only appears on search.
 */
export function hiddenFacets(scope: ResultsScope): FacetKey[] {
  switch (scope.kind) {
    case "search":
      return [];
    case "category":
      return ["category"];
    case "audience":
      return ["category", "audience"];
    case "new":
      return ["category", "newIn"];
  }
}

export function sortsFor(scope: ResultsScope): Sort[] {
  const listing: Sort[] = ["newest", "price-asc", "price-desc"];
  return scope.kind === "search" ? ["relevance", ...listing] : listing;
}

export function defaultSort(scope: ResultsScope): Sort {
  return sortsFor(scope)[0];
}

const PRICE_ORDER = PRICE_BANDS.map((band) => band.value);
// Code-point order, not localeCompare: the server and the browser must build the same query key
// whatever their locales.
const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sorted = <T extends string>(values: T[], order?: readonly T[]) =>
  [...new Set(values)].sort((a, b) => (order ? order.indexOf(a) - order.indexOf(b) : byCodePoint(a, b)));

const within = <T extends string>(values: readonly string[], vocabulary: readonly T[]) =>
  values.filter((value): value is T => (vocabulary as readonly string[]).includes(value));

/** The scope rebuilt from its own fields only, so callers' key order and extras don't matter. */
function canonicalScope(scope: ResultsScope): ResultsScope {
  switch (scope.kind) {
    case "search":
      return { kind: "search", q: buildSearchQuery(scope.q)?.text ?? "" };
    case "new":
      return { kind: "new", limit: scope.limit };
    case "audience":
      return { kind: "audience", audience: scope.audience };
    case "category":
      return { kind: "category", categorySlug: scope.categorySlug };
  }
}

/**
 * The canonical form of a query: what getResults caches on. Drops values outside each filter's
 * vocabulary and filters the page hides, reduces search text to its words, keeps a tab only where
 * tabs exist (New, Women, Men), and clamps the page to 1…MAX_PAGE. Idempotent.
 */
export function normaliseQuery(query: ResultsQuery): ResultsQuery {
  const scope = canonicalScope(query.scope);
  const hidden = new Set(hiddenFacets(scope));
  const { filters } = query;
  const hasTabs = scope.kind === "new" || scope.kind === "audience";
  const page = Number.isFinite(query.page) ? Math.floor(query.page) : 1;
  return {
    scope,
    ...(hasTabs && query.tab !== undefined ? { tab: query.tab } : {}),
    filters: {
      category: hidden.has("category") ? [] : sorted(filters.category),
      audience: hidden.has("audience") ? [] : sorted(within(filters.audience, ["women", "men"] as const)),
      colour: sorted(within(filters.colour, COLOUR_FAMILIES)),
      material: sorted(within(filters.material, MATERIALS)),
      price: sorted(within(filters.price, PRICE_ORDER), PRICE_ORDER),
      stock: filters.stock === true,
      newIn: hidden.has("newIn") ? false : filters.newIn === true,
    },
    sort: sortsFor(scope).includes(query.sort) ? query.sort : defaultSort(scope),
    page: Math.min(MAX_PAGE, Math.max(1, page)),
  };
}

/** How many filter values are active (each switch counts as one). */
export function activeFilterCount(filters: Filters): number {
  return (
    filters.category.length +
    filters.audience.length +
    filters.colour.length +
    filters.material.length +
    filters.price.length +
    Number(filters.stock) +
    Number(filters.newIn)
  );
}

/** One selected filter value; switches use their URL value ("in", "1"). */
export type ActiveFilter = { key: FacetKey; value: string };

const LIST_KEYS = ["category", "audience", "colour", "material", "price"] as const;

/** Every selected value, in filter order with the switches last: one chip each. */
export function activeFilters(filters: Filters): ActiveFilter[] {
  return [
    ...LIST_KEYS.flatMap((key) => filters[key].map((value) => ({ key, value }))),
    ...(filters.stock ? [{ key: "stock" as const, value: "in" }] : []),
    ...(filters.newIn ? [{ key: "newIn" as const, value: "1" }] : []),
  ];
}

/** The filters with one value removed (or one switch turned off). */
export function withoutFilter(filters: Filters, { key, value }: ActiveFilter): Filters {
  if (key === "stock" || key === "newIn") return { ...filters, [key]: false };
  return { ...filters, [key]: (filters[key] as string[]).filter((selected) => selected !== value) };
}

/** A filter option with no results is disabled, unless it's selected (so it can be removed). */
export function optionState(count: number, selected: boolean): "enabled" | "disabled" {
  return count > 0 || selected ? "enabled" : "disabled";
}
