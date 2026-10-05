import {
  createLoader,
  parseAsInteger,
  parseAsNativeArrayOf,
  parseAsString,
  parseAsStringLiteral,
  type inferParserType,
  type Nullable,
} from "nuqs/server";

import { defaultSort, normaliseQuery, PRICE_BANDS, SORTS, type ResultsQuery, type ResultsScope } from "./filters";
import { COLOUR_FAMILIES, MATERIALS } from "./vocabulary";

// Results state lives in the URL (see the M3 spec, "URL state"). These parsers are shared by the
// pages (server, via loadResultsParams), the listing UI (client, via useQueryStates) and the
// results endpoint. Lists repeat their key (?colour=red&colour=black); a value a parser doesn't
// know is dropped rather than failing the page.

export const resultsParsers = {
  q: parseAsString.withDefault(""),
  sort: parseAsStringLiteral(SORTS),
  category: parseAsNativeArrayOf(parseAsString),
  audience: parseAsNativeArrayOf(parseAsStringLiteral(["women", "men"] as const)),
  colour: parseAsNativeArrayOf(parseAsStringLiteral(COLOUR_FAMILIES)),
  material: parseAsNativeArrayOf(parseAsStringLiteral(MATERIALS)),
  price: parseAsNativeArrayOf(parseAsStringLiteral(PRICE_BANDS.map((band) => band.value))),
  stock: parseAsStringLiteral(["in"] as const),
  new: parseAsStringLiteral(["1"] as const),
  page: parseAsInteger.withDefault(1),
};

export type ResultsParams = inferParserType<typeof resultsParsers>;

export const loadResultsParams = createLoader(resultsParsers);

/** The normalised query for a page's URL params; `scope` and `tab` come from the route. */
export function toResultsQuery(params: ResultsParams, scope: ResultsScope, tab?: string): ResultsQuery {
  return normaliseQuery({
    scope,
    tab,
    filters: {
      category: params.category,
      audience: params.audience,
      colour: params.colour,
      material: params.material,
      price: params.price,
      stock: params.stock === "in",
      newIn: params.new === "1",
    },
    sort: params.sort ?? defaultSort(scope),
    page: params.page,
  });
}

function collectionOf(scope: Exclude<ResultsScope, { kind: "search" }>): string {
  switch (scope.kind) {
    case "new":
      return "new";
    case "audience":
      return scope.audience;
    case "category":
      return scope.categorySlug;
  }
}

/**
 * The results endpoint's URL for a query. Keys come in a fixed order and defaults are left out, so
 * equal queries share one URL (and one browser and CDN cache entry). With `slice`, it asks for
 * page `query.page` on its own (Load more) rather than everything up to it.
 */
export function resultsApiPath(query: ResultsQuery, { slice = false }: { slice?: boolean } = {}): string {
  const { scope, tab, filters, sort, page } = normaliseQuery(query);
  const params = new URLSearchParams();
  if (scope.kind === "search") params.set("q", scope.q);
  else params.set("collection", collectionOf(scope));
  if (tab !== undefined) params.set("tab", tab);
  if (sort !== defaultSort(scope)) params.set("sort", sort);
  for (const key of ["category", "audience", "colour", "material", "price"] as const) {
    for (const value of filters[key]) params.append(key, value);
  }
  if (filters.stock) params.set("stock", "in");
  if (filters.newIn) params.set("new", "1");
  if (page !== 1) params.set("page", String(page));
  if (slice) params.set("slice", "1");
  return `/api/products?${params}`;
}

/**
 * The URL params for a query (the inverse of toResultsQuery), for writing a draft or a change
 * back with setParams. Defaults and empty filters are null, so they leave the URL. `q` belongs to
 * the page, so it isn't touched.
 */
export function resultsParamsFor({ scope, filters, sort, page }: ResultsQuery): Partial<Nullable<ResultsParams>> {
  const list = <T>(values: T[]) => (values.length > 0 ? values : null);
  return {
    sort: sort === defaultSort(scope) ? null : sort,
    category: list(filters.category),
    audience: list(filters.audience),
    colour: list(filters.colour),
    material: list(filters.material),
    price: list(filters.price),
    stock: filters.stock ? "in" : null,
    new: filters.newIn ? "1" : null,
    page: page === 1 ? null : page,
  };
}
