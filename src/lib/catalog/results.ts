import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { categories, colourFamily, material, products } from "@/db/schema";
import {
  hiddenFacets,
  MAX_RESTORE_PAGES,
  normaliseQuery,
  PRICE_BANDS,
  RESULTS_PAGE_SIZE,
  type FacetKey,
  type Filters,
  type ResultsQuery,
} from "./filters";
import { NEW_ARRIVALS_PAGE_LIMIT } from "./merchandising";
import { productColumns } from "./product-columns";
import { buildSearchQuery } from "./search";
import type { Product } from "./types";

// Listing and search results. getResults restores the first pages (up to MAX_RESTORE_PAGES) with
// the total and a count for every filter option; getResultsPage returns one later page on its own,
// for Load more. Both are cached reads. See the M3 spec, "Data and search".

export { RESULTS_PAGE_SIZE };

export type Facet = { value: string; label: string; count: number };

export type Results = {
  /** The first `page` × 24 products, so a reload restores what Load more had shown. */
  products: Product[];
  total: number;
  /** The last page included: the one asked for, capped at MAX_RESTORE_PAGES and the page count. */
  page: number;
  pageCount: number;
  /** Options per filter; empty for filters the page hides. */
  facets: Record<FacetKey, Facet[]>;
};

/**
 * One page of products on its own (Load more): page N holds products (N−1) × 24 to N × 24. The
 * total and page count come from the restored results, so a page doesn't count every match.
 */
export type ResultsPage = Pick<Results, "products" | "page">;

const FACET_KEYS: FacetKey[] = ["category", "audience", "colour", "material", "price", "stock", "newIn"];

/** Normalises the query first, so equal requests share one cache entry. */
export async function getResults(query: ResultsQuery): Promise<Results> {
  const normalised = normaliseQuery(query);
  return cachedResults({ ...normalised, page: Math.min(normalised.page, MAX_RESTORE_PAGES) });
}

/** Page `query.page` on its own; empty past the last page. */
export async function getResultsPage(query: ResultsQuery): Promise<ResultsPage> {
  return cachedPage(normaliseQuery(query));
}

async function cachedPage(query: ResultsQuery): Promise<ResultsPage> {
  "use cache";
  cacheTag("catalog");
  cacheLife("catalog");

  const search = query.scope.kind === "search" ? buildSearchQuery(query.scope.q) : undefined;
  if (query.scope.kind === "search" && !search) return { products: [], page: query.page };

  const rows = await db
    .select(productColumns)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions(query, search)))
    .orderBy(...ordering(query, search))
    .limit(RESULTS_PAGE_SIZE)
    .offset((query.page - 1) * RESULTS_PAGE_SIZE);
  return { products: rows, page: query.page };
}

async function cachedResults(query: ResultsQuery): Promise<Results> {
  "use cache";
  cacheTag("catalog");
  cacheLife("catalog");

  const search = query.scope.kind === "search" ? buildSearchQuery(query.scope.q) : undefined;
  if (query.scope.kind === "search" && !search) return emptyResults(query);

  const hidden = new Set(hiddenFacets(query.scope));
  const visible = FACET_KEYS.filter((key) => !hidden.has(key));
  const [rows, facetRows] = await Promise.all([
    db
      .select({ ...productColumns, total: sql<number>`count(*) over ()`.mapWith(Number) })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...conditions(query, search)))
      .orderBy(...ordering(query, search))
      .limit(query.page * RESULTS_PAGE_SIZE),
    visible.length === 0 ? [] : facetCounts(query, search, visible),
  ]);

  const total = rows[0]?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / RESULTS_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  return {
    products: rows.slice(0, page * RESULTS_PAGE_SIZE).map(toProduct),
    total,
    page,
    pageCount,
    facets: buildFacets(query.filters, visible, facetRows),
  };
}

type SearchQuery = { tsquery: string; text: string; words: string[] };


/** Drops the window-count column a results row carries. */
function toProduct(row: Product & { total: number }): Product {
  const { slug, name, category, price, colour, description, details, stock, images } = row;
  return { slug, name, category, price, colour, description, details, stock, images };
}

/** Products among the newest N (New arrivals, and the "New in" filter). */
const newest = (limit: number) =>
  sql`${products.id} in (select ${products.id} from ${products} order by ${products.createdAt} desc, ${products.id} limit ${limit})`;

/**
 * Typo tolerance: a word's trigram word similarity to a product's search_text must reach this. pg_trgm's default (0.6, used by the `<%` operator) misses one-letter slips in common words
 * ("lether" scores 0.5 against "leather"). An explicit threshold can't use the trigram index (the
 * operator reads a session setting, and the Neon HTTP driver has no sessions); at this catalogue's
 * size that costs nothing measurable.
 */
export const TYPO_THRESHOLD = 0.45;

/** Words shorter than this only match exactly: "and" would otherwise match inside "band". */
const MIN_TYPO_LENGTH = 4;

/**
 * Every word must match, by full text (the last word as a prefix) or, for longer words, by a
 * near spelling. A stop word ("the") can't be searched for, so it doesn't constrain the match,
 * but a query of stop words only matches nothing.
 */
function matches(search: SearchQuery): SQL {
  const last = search.words.length - 1;
  const perWord = search.words.map((word, index) => {
    const term = index === last ? `${word}:*` : word;
    const typo =
      word.length >= MIN_TYPO_LENGTH
        ? sql` or word_similarity(${word}, ${products.searchText}) >= ${TYPO_THRESHOLD}`
        : sql``;
    return sql`(numnode(to_tsquery('english', ${term})) = 0 or ${products.search} @@ to_tsquery('english', ${term})${typo})`;
  });
  return sql`(numnode(to_tsquery('english', ${search.tsquery})) > 0 and ${and(...perWord)})`;
}

/** Every condition for the query, optionally leaving one facet's own selection out (for its counts). */
function conditions(query: ResultsQuery, search: SearchQuery | undefined, without?: FacetKey): SQL[] {
  const { scope, tab, filters } = query;
  const where: SQL[] = [];
  if (scope.kind === "new") where.push(newest(scope.limit));
  if (scope.kind === "audience") where.push(inArray(products.audience, [scope.audience, "unisex"]));
  if (scope.kind === "category") where.push(eq(categories.slug, scope.categorySlug));
  if (search) where.push(matches(search));
  if (tab) where.push(eq(categories.slug, tab));

  const apply = (key: FacetKey) => key !== without;
  if (apply("category") && filters.category.length) where.push(inArray(categories.slug, filters.category));
  if (apply("audience") && filters.audience.length) {
    where.push(inArray(products.audience, [...filters.audience, "unisex"]));
  }
  if (apply("colour") && filters.colour.length) where.push(inArray(products.colourFamily, filters.colour));
  if (apply("material") && filters.material.length) where.push(inArray(products.material, filters.material));
  if (apply("price") && filters.price.length) where.push(sql`(${sql.join(filters.price.map(priceRange), sql` or `)})`);
  if (apply("stock") && filters.stock) where.push(sql`${products.stock} > 0`);
  if (apply("newIn") && filters.newIn) where.push(newest(NEW_ARRIVALS_PAGE_LIMIT));
  return where;
}

function priceRange(value: Filters["price"][number]): SQL {
  const band = PRICE_BANDS.find((candidate) => candidate.value === value)!;
  return band.max === null
    ? sql`${products.price} >= ${band.min}`
    : sql`${products.price} between ${band.min} and ${band.max}`;
}

function ordering(query: ResultsQuery, search: SearchQuery | undefined): SQL[] {
  switch (query.sort) {
    case "price-asc":
      return [asc(products.price), asc(products.id)];
    case "price-desc":
      return [desc(products.price), asc(products.id)];
    case "relevance":
      if (search) {
        return [
          sql`ts_rank_cd(${products.search}, to_tsquery('english', ${search.tsquery})) desc`,
          sql`word_similarity(${search.text}, ${products.searchText}) desc`,
          desc(products.createdAt),
          asc(products.id),
        ];
      }
      return [desc(products.createdAt), asc(products.id)];
    case "newest":
      return [desc(products.createdAt), asc(products.id)];
  }
}

type FacetRow = { facet: FacetKey; value: string; label: string | null; count: number };

/** Small value lists the audience and price counts range over (constants, so inlined). */
const AUDIENCE_VALUES = sql.raw(`(values ('women'), ('men')) as a(value)`);
const PRICE_VALUES = sql.raw(
  `(values ${PRICE_BANDS.map((b) => `('${b.value}', ${b.min}, ${b.max ?? 2_147_483_647})`).join(", ")}) as b(value, min, max)`,
);

/**
 * All facet counts in one round trip: a UNION ALL of one grouped count per visible facet. Every
 * select names its columns, because any of them can come first (UNION takes the first's names).
 */
async function facetCounts(query: ResultsQuery, search: SearchQuery | undefined, visible: FacetKey[]): Promise<FacetRow[]> {
  const from = (key: FacetKey, values?: SQL) =>
    sql`from ${products} inner join ${categories} on ${products.categoryId} = ${categories.id}${values ? sql` cross join ${values}` : sql``} where ${and(...conditions(query, search, key)) ?? sql`true`}`;
  const selects: Record<FacetKey, SQL> = {
    category: sql`select 'category' as facet, ${categories.slug} as value, ${categories.name} as label, count(*)::int as count ${from("category")} group by ${categories.slug}, ${categories.name}`,
    audience: sql`select 'audience' as facet, a.value as value, null::text as label, count(*)::int as count ${from("audience", AUDIENCE_VALUES)} and ${products.audience}::text in (a.value, 'unisex') group by a.value`,
    colour: sql`select 'colour' as facet, ${products.colourFamily}::text as value, null::text as label, count(*)::int as count ${from("colour")} group by ${products.colourFamily}`,
    material: sql`select 'material' as facet, ${products.material}::text as value, null::text as label, count(*)::int as count ${from("material")} group by ${products.material}`,
    price: sql`select 'price' as facet, b.value as value, null::text as label, count(*)::int as count ${from("price", PRICE_VALUES)} and ${products.price} between b.min and b.max group by b.value`,
    stock: sql`select 'stock' as facet, 'in' as value, null::text as label, count(*)::int as count ${from("stock")} and ${products.stock} > 0`,
    newIn: sql`select 'newIn' as facet, '1' as value, null::text as label, count(*)::int as count ${from("newIn")} and ${newest(NEW_ARRIVALS_PAGE_LIMIT)}`,
  };
  const union = sql.join(
    visible.map((key) => sql`(${selects[key]})`),
    sql` union all `,
  );
  return ((await db.execute(union)) as unknown as { rows: FacetRow[] }).rows;
}

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * Options per visible facet: every value with results, plus any selected value (count 0), in a
 * stable order: enums in their declared order, price bands low to high, categories by name.
 * In stock and New in always have their single option.
 */
function buildFacets(filters: Filters, visible: FacetKey[], rows: FacetRow[]): Record<FacetKey, Facet[]> {
  const counts = new Map(rows.map((row) => [`${row.facet}:${row.value}`, row]));
  const countOf = (key: FacetKey, value: string) => counts.get(`${key}:${value}`)?.count ?? 0;
  const options = (key: FacetKey, values: readonly string[], selected: readonly string[], label: (value: string) => string) =>
    values
      .map((value) => ({ value, label: label(value), count: countOf(key, value) }))
      .filter((option) => option.count > 0 || selected.includes(option.value));

  const categoryNames = new Map(rows.filter((row) => row.facet === "category").map((row) => [row.value, row.label ?? row.value]));
  const categoryValues = [...new Set([...categoryNames.keys(), ...filters.category])].sort((a, b) =>
    (categoryNames.get(a) ?? a).localeCompare(categoryNames.get(b) ?? b),
  );
  const facets: Record<FacetKey, Facet[]> = {
    category: options("category", categoryValues, filters.category, (value) => categoryNames.get(value) ?? capitalise(value)),
    audience: options("audience", ["women", "men"], filters.audience, capitalise),
    colour: options("colour", colourFamily.enumValues, filters.colour, capitalise),
    material: options("material", material.enumValues, filters.material, capitalise),
    price: options(
      "price",
      PRICE_BANDS.map((band) => band.value),
      filters.price,
      (value) => PRICE_BANDS.find((band) => band.value === value)!.label,
    ),
    stock: [{ value: "in", label: "In stock", count: countOf("stock", "in") }],
    newIn: [{ value: "1", label: "New in", count: countOf("newIn", "1") }],
  };
  for (const key of FACET_KEYS) if (!visible.includes(key)) facets[key] = [];
  return facets;
}

function emptyResults(query: ResultsQuery): Results {
  return { products: [], total: 0, page: 1, pageCount: 1, facets: buildFacets(query.filters, [], []) };
}
