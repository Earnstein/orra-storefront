import type { ColourFamily, Material } from "@/db/schema/catalog";
import type { CollectionScope } from "./collections";
import { MAX_QUERY_LENGTH } from "./search";

// What a results request can ask for, and the rules that keep equal requests equal (so they share
// one cache entry) and drop what a page doesn't offer.

export type Sort = "newest" | "price-asc" | "price-desc" | "relevance";

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
const sorted = <T extends string>(values: T[], order?: readonly T[]) =>
  [...new Set(values)].sort((a, b) => (order ? order.indexOf(a) - order.indexOf(b) : a.localeCompare(b)));

/** The canonical form of a query: what getResults caches on. Idempotent. */
export function normaliseQuery(query: ResultsQuery): ResultsQuery {
  const hidden = new Set(hiddenFacets(query.scope));
  const { filters } = query;
  const scope =
    query.scope.kind === "search" ? { kind: "search" as const, q: query.scope.q.trim().slice(0, MAX_QUERY_LENGTH) } : query.scope;
  return {
    scope,
    ...(query.tab === undefined ? {} : { tab: query.tab }),
    filters: {
      category: hidden.has("category") ? [] : sorted(filters.category),
      audience: hidden.has("audience") ? [] : sorted(filters.audience),
      colour: sorted(filters.colour),
      material: sorted(filters.material),
      price: sorted(filters.price, PRICE_ORDER),
      stock: filters.stock,
      newIn: hidden.has("newIn") ? false : filters.newIn,
    },
    sort: sortsFor(scope).includes(query.sort) ? query.sort : defaultSort(scope),
    page: Math.max(1, Math.floor(query.page) || 1),
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

/** A filter option with no results is disabled, unless it's selected (so it can be removed). */
export function optionState(count: number, selected: boolean): "enabled" | "disabled" {
  return count > 0 || selected ? "enabled" : "disabled";
}
