import "server-only";

import { emptyFilters } from "./filters";
import { getResults } from "./results";
import type { ProductSummary } from "./types";

// What the header search panel shows while typing. Built on getResults, so it shares its cache,
// matching and relevance order with the /search page it links to.

export const SUGGESTION_LIMIT = 6;

export type Suggestions = {
  /** The most relevant products, at most SUGGESTION_LIMIT. */
  products: ProductSummary[];
  /** Categories with matching products, the most matches first. */
  categories: { slug: string; name: string; count: number }[];
  /** Every match, for "See all N results". */
  total: number;
};

/** Suggestions for search text; empty for text with nothing searchable in it. */
export async function getSuggestions(q: string): Promise<Suggestions> {
  const results = await getResults({ scope: { kind: "search", q }, filters: emptyFilters(), sort: "relevance", page: 1 });
  return {
    products: results.products.slice(0, SUGGESTION_LIMIT),
    categories: results.facets.category
      .map(({ value, label, count }) => ({ slug: value, name: label, count }))
      .filter((category) => category.count > 0)
      .toSorted((a, b) => b.count - a.count),
    total: results.total,
  };
}
