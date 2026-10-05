# Orra M3: find (design)

- **Date:** 2026-10-05
- **Status:** awaiting review
- **Milestone:** M3 Find → `v0.4.0`, as scoped in the [roadmap](2026-10-04-roadmap-to-live-design.md)
- **Scope of this spec:** search, filters, sort and pagination on every listing, the caching model they run on, and their tests. The M3 plan (`docs/superpowers/plans/2026-10-05-m3-find.md`) turns it into tasks.
- **Not in this spec:** accounts, the bag and checkout, and admin (M4–M6). Rate limiting the public endpoints.

## Intent

**What M3 is for:** shoppers can find things.
- Every listing can be filtered, sorted and paged, and the whole state lives in the URL: shareable, reloadable, and safe with the Back button.
- Search is server-side and fast. Results appear in a header panel as the shopper types, typos included, and a `/search` page holds the full results.
- It has to feel like a flagship store, not a demo: the user's brief is "the best side project".

**Decisions made while brainstorming:**

| Question | Decision |
|---|---|
| Client tools (decided in M2, kept) | nuqs for URL state, TanStack Query for fetching and caching, TanStack Pacer's `useDebouncedValue` for the search text. TanStack DB isn't used for search. |
| Pagination style (roadmap open item) | **Load more.** A button under the grid appends the next 24. `?page=N` restores the first N pages. |
| Price filter control (roadmap open item) | **Price bands** with counts, combinable like the other filters: under $500 · $500–$1,000 · $1,000–$2,000 · $2,000+. |
| What the header search panel shows | **Products plus suggestions.** Before typing: popular searches and links. While typing: up to 6 products, matching categories and "See all N results". |
| Function region (roadmap open item) | Neon runs in AWS US East. Vercel's default function region, `iad1`, is already next to it, so nothing changes. |
| Caching model | **Cache Components** (`cacheComponents: true`). Catalogue reads become `"use cache"` functions tagged `catalog` with a 5-minute lifetime, and every route migrates off `revalidate` and `dynamicParams`. `unstable_cache` was rejected because Next 16 documents it as replaced by `"use cache"`, and CDN-only caching because first renders would query Neon on every request. |

The design was presented in five sections, and the user approved each one: modules; data and search; endpoints and URL state; UI; testing, performance and errors. The UI follows Gucci UK's listing and search patterns, which were researched in the browser first.

**Assumptions** (stated to the user and not contradicted): the catalogue stays at 48 products; the look stays monochrome with filters in a slide-out sheet; M2's deferred minors that touch listings are fixed in M3.

## Exit criteria (from the roadmap)

- Filters, sort and pagination work on every listing through the URL.
- Live search finds products by name, colour and category, including with typos.

Measured as:
- e2e: a filter changes the URL, the count and the grid; Back undoes it; reload restores it. Load more appends, and `?page=2` restores. Sorting by price orders the grid.
- e2e: typing "lether" in the search panel shows the leather products. "boots" finds the boots. Enter opens `/search?q=…` with the same results.
- Performance budgets (below) are met on the Vercel preview and recorded in each PR.

## Out of scope

- Search analytics, saved searches and personalised ranking.
- Rate limiting. The endpoints are read-only and public, and the CDN caches them for 5 minutes.
- Infinite scroll and numbered pages.
- New products or categories.

## Caching model (module 2)

**Turning it on.** `next.config.ts` sets `cacheComponents: true`. From then on:
- Catalogue reads in `src/lib/catalog/queries.ts` start with `"use cache"`, call `cacheTag("catalog")` and `cacheLife({ revalidate: 300, … })`, and keep their current signatures. This replaces the routes' `revalidate = 300`.
- Every `export const revalidate` and `export const dynamicParams` is deleted. Next fails the build on `dynamicParams` under Cache Components. Unknown slugs already call `notFound()`; params missing from `generateStaticParams` now render on request.
- Pages that read `searchParams` keep their static parts (header, breadcrumb, heading, tabs, toolbar) outside a `Suspense` boundary. The results sit inside it, with a skeleton grid of the same tile size.
- M6's admin will call `revalidateTag("catalog")` after writes. M3 doesn't need to.

**The risk, checked first.** In M2, a `loading.tsx` streamed a 200 before `notFound()` ran, so unknown collection paths lost their 404. Prerendered shells stream by design. The first task of the module is a spike: turn the flag on and run the existing 404 e2e tests (unknown product, collection, tab and story). If any returns 200, stop and bring the finding back before migrating further. The spike's outcome is recorded in the plan's ledger.

**What shoppers see:** nothing new. Pages are the same, and the existing e2e suite is the safety net.

## Data and search (module 3)

### Migration `0004_product_search`

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
ALTER TABLE products ADD COLUMN search tsvector;
ALTER TABLE products ADD COLUMN search_text text;
-- function products_search_refresh(): fills both from NEW and the category's name
-- trigger BEFORE INSERT OR UPDATE ON products
-- trigger AFTER UPDATE OF name ON categories: refreshes that category's products
UPDATE products SET … ;            -- backfill existing rows (production isn't re-seeded)
ALTER TABLE products ALTER COLUMN search SET NOT NULL, ALTER COLUMN search_text SET NOT NULL;
CREATE INDEX products_search_idx ON products USING gin (search);
CREATE INDEX products_search_text_trgm_idx ON products USING gin (search_text gin_trgm_ops);
```

- **`search`**, using the English configuration (so "bags" matches "bag"):
  - weight **A**: name;
  - weight **B**: colour, colour family, material and the category's name;
  - weight **C**: description and the details' values.
- **`search_text`**: lower-cased name, colour, colour family, material and category name, for typo matching.
- A generated column can't read the category's name, so a trigger maintains both. The category trigger re-saves that category's products, which fires the product trigger.
- The schema declares both columns, so Drizzle's snapshot matches. The seed doesn't set them; the trigger does.
- PGlite 0.5.8 supports `pg_trgm` (checked during M2's brainstorming), so tests run the real migration.

### Matching a search

`buildSearchQuery(q)` in `src/lib/catalog/search.ts` is a pure function:
- trims `q`, caps it at 100 characters and lower-cases it;
- splits it into words of letters and digits, dropping everything else, so input like `'; drop` or `&|!:*()` is just words or nothing;
- produces a `tsquery` string: the words joined with `&`, and the **last word as a prefix** (`lea:*`), so results appear mid-word;
- returns `undefined` when no words remain.

A product matches when `search @@ to_tsquery('english', $tsquery)`, **or** when `$q <% search_text` (trigram word similarity at the default 0.6 threshold), so "lether tote" still finds the tote.

**Ranking** on `/search` and in the panel: `ts_rank_cd(search, tsquery)` descending, then `word_similarity($q, search_text)` descending, then newest.

### Filters

| Filter | URL key | Values | Rule |
|---|---|---|---|
| Category | `category` | category slugs | Shown only on `/search`. Listings keep their path tabs. |
| Audience | `audience` | `women`, `men` | Women means women plus unisex, and the same for Men. Hidden on `/women`, `/men`, `/collections/women…` and `/collections/men…`. |
| Colour | `colour` | colour families | |
| Material | `material` | materials | |
| Price | `price` | `under-500`, `500-1000`, `1000-2000`, `2000-plus` | Bands on integer cents: `< 50000`, `50000–99999`, `100000–199999`, `≥ 200000`. |
| In stock | `stock` | `in` | `stock > 0`. |
| New in | `new` | `1` | One of the newest `NEW_ARRIVALS_PAGE_LIMIT` (24) products. Hidden on `/collections/new…`. |

- OR within a filter, AND across filters.
- The page's scope (New, an audience, a category, a tab, or search) is a fixed base filter. It isn't a URL parameter.

### Sort

`sort` is `newest` (the default on listings), `price-asc`, `price-desc` or `relevance` (the default on `/search`, and only offered there). Ties are broken by `id`, so pages never overlap.

### `getResults(query)`

`src/lib/catalog/results.ts`:

```ts
type ResultsQuery = {
  scope: CollectionScope | { kind: "search"; q: string };
  tab?: string;              // category slug of a listing tab
  filters: Filters;          // normalised: sorted, deduplicated, defaults removed
  sort: Sort;
  page: number;              // ≥ 1, capped to the last page
};
type Results = {
  products: Product[];       // the first page × 24 products
  total: number;
  page: number; pageCount: number;
  facets: Record<FacetKey, { value: string; label: string; count: number }[]>;
};
```

- Products and the total come from one query (`count(*) over ()`). All facet counts come from a second query: a `UNION ALL` of one grouped count per facet. The two run in parallel.
- **Facet counts** apply the scope and every *other* active filter, but not the facet's own selection, so options in the same facet stay selectable and counts never lead to zero results.
- `getResults` is `"use cache"`, with `cacheTag("catalog")` and the 5-minute lifetime. Its input is normalised first (`normaliseQuery`, pure and unit-tested), so identical states share one cache entry.

## Endpoints and URL state (module 4)

### URL state

`src/lib/catalog/search-params.ts` defines nuqs parsers for `q`, `sort`, `category`, `audience`, `colour`, `material`, `price`, `stock`, `new` and `page`:
- **Server pages** read them through nuqs' `createLoader`, the **endpoints** through the same loader, and **client components** through `useQueryStates`.
- **Invalid values** are dropped: an unknown colour, a page of `-3`, a sort not offered on that page. A hand-edited URL never causes an error.
- **History:**
  - filter and sort changes **push** one entry (see the sheet's draft below);
  - "Load more" **replaces** the entry;
  - removing a chip pushes.
- **Shallow updates:** the client fetches new results, and the server doesn't re-render the page.

### Endpoints

- **`GET /api/products?collection=…&tab=…&q=…&<filters>&page=…`**
  - The scope is checked with `resolveCollection`, or is a search if `q` is set.
  - It returns `Results` as JSON.
  - It sends `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`, plus a `Server-Timing` header with the database time.
  - An invalid scope returns 404 JSON.
- **`GET /api/search/suggest?q=…`**
  - It returns `{ products: Product[] (≤ 6), categories: { slug, name, count }[], total }`.
  - It uses the same cache tag, lifetime and headers.

### Data flow

- **First load:** the page's results component reads the parsed `searchParams`, prefetches `getResults` into the request's QueryClient, and renders inside `HydrationBoundary`. The client starts with the data and doesn't fetch it again.
- **Results on the client:** `useInfiniteQuery` is keyed on the normalised query. `placeholderData` keeps the previous results on screen, dimmed, while new ones load, and the count change is announced in an `aria-live` region. Each request passes the query's `AbortSignal` to `fetch`, so stale requests are cancelled.
- **Load more** calls `fetchNextPage` and replaces `?page`.
- **Live search:**
  - **Typing:** Pacer's `useDebouncedValue` waits 200 ms after typing. The query runs from 2 characters and keeps the previous suggestions while loading.
  - **Enter, or "See all N results",** goes to `/search?q=…`.
  - **On `/search`,** editing the query replaces `q` in the URL, debounced.

### Errors

- **Client fetch failure:** the last results stay on screen, with an inline "Couldn't update results" and a **Try again** button.
- **Server render failure:** handled by the existing `error.tsx`.
- **Search states:** `/search` with an empty `q` shows the search field and popular searches. A `q` with no results shows "No results for ‘…’" and the popular searches.

## UI (modules 4 and 5)

Monochrome, imagery-first, following Gucci UK's patterns. Components use the design system's tokens and primitives, and shadcn on Base UI (`Sheet`, `Accordion`, `Checkbox`, `Switch`, `RadioGroup`).

### Listing toolbar

It replaces today's count and sort label row on every listing and on `/search`:
- **Left:** "48 items sorted by **Newest**". The sort name opens the sheet at Sort.
- **Right:** **Filter and sort**, with a count when filters are active ("Filter and sort (2)").
- **Below:** a chip per active filter value ("Brown ×", labelled "Remove filter: Brown"), and **Clear all**.

### Filter and sort sheet

- **Placement:** from the right on desktop (`max-w-md`), full-screen on phones. Focus is trapped while it's open, and Esc closes it.
- **Header:** "Filter and sort" with **Clear all**.
- **Top:** switches for **In stock** and **New in**.
- **Accordions:**
  - **Sort by:** radio buttons.
  - **Audience.**
  - **Colour:** square swatches labelled "Brown (12)". Swatch colours are data, kept in one map in the component, and multicolour uses a pattern.
  - **Material** and **Price:** checkboxes with counts.
  - **Category:** only on `/search`.
- **Zero counts:** options with a count of 0 are disabled unless already selected.
- **Draft and apply:**
  - **Draft:** the sheet edits a draft. Its sticky **Show N items** button shows the draft's total, fetched from the same cached endpoint.
  - **Show N items** applies the draft as one history entry and closes the sheet. Back then undoes the whole session.
  - **Closing without applying** throws the draft away.

### Load more

- **Under the grid:** "Showing 24 of 48", a thin progress line, and a **Load more** button that shows a loading state.
- **Focus** stays on the button, and a live region announces "24 more items loaded".
- **When everything is shown**, the button goes away.

### Header search

- **Opening:** the header's search icon becomes a button. On desktop it opens a panel under the header with a backdrop; on phones, a full-screen sheet. The input gets focus, and Esc or **Close** shuts it.
- **The input:** an underlined field, "Search for: bags", inside `<form action="/search" method="get">`, so Enter works without JavaScript.
- **Before typing:**
  - **Popular searches**, a list in `src/content/search.ts`. A test proves each one returns results.
  - **New in:** Women · Men.
  - **Stories.**
- **While typing:** up to 6 product cards (3 columns on desktop, 2 on phones), the matching categories as links, and **See all N results →**. A live region announces the count.
- **No results:** "No results for ‘xyz’" and the popular searches.

### `/search`

- **With `q`:** the heading "Results for ‘leather’", followed by the toolbar, the sheet (with Category), the grid and Load more.
- **Without `q`:** a large search field and the popular searches.
- **Metadata:** the title is "Search". The page is `noindex` when `q` is set.

## Fixes carried from M2

- **Empty-state e2e:** the test always skips now that every Women and Men tab has products. It becomes an e2e on `/search?q=…&colour=…` with a filter combination that has no results.
- **Related products:** the row uses the editorial product row's complete-rows rule, so no card sits alone at 768–1279 px.
- **Breadcrumbs:** on `/collections/women…` and `/collections/men…`, the Women and Men crumbs link to the landings.
- **e2e timeouts:** structural e2e checks wait for `domcontentloaded`, not `load`, so slow images can't time them out.

## Modules

| # | Branch / PR | Delivers |
|---|---|---|
| 1 | `docs/m3-find` | This spec, the plan, and the roadmap's resolved open items. |
| 2 | `chore/cache-components` | The 404 spike, then `cacheComponents` on, the routes migrated and the catalogue queries cached. No visible change. |
| 3 | `feat/search-index` | Migration `0004`, `buildSearchQuery`, `normaliseQuery` and `getResults`, with tests. No UI. |
| 4 | `feat/listing-filters` | nuqs parsers, `/api/products`, the toolbar, chips, sheet and Load more on every listing, axe checks, and the M2 fixes above. |
| 5 | `feat/live-search` | `/api/search/suggest`, the header search panel and `/search`. |
| 6 | `docs/milestone-v0.4.0` | The milestone entry, then the tag and the release. |

New dependencies:
- `nuqs` (module 4);
- `@tanstack/react-pacer` (module 5, beta, so the exact version is pinned);
- `@axe-core/playwright` (dev, module 4).

## Testing

| Layer | Covers |
|---|---|
| Unit (Vitest) | **Search params:** invalid values dropped, defaults left out, values sorted and deduplicated. **`buildSearchQuery`:** escaping, the last word as a prefix, the 100-character cap, hostile input. **Filters:** price-band boundaries, which filters each scope hides. **Content:** popular searches have results. |
| Database (PGlite, real migrations) | **Migration:** `0004`'s backfill, replayed over pre-M3 rows. **Triggers:** they refresh the columns on a product edit and on a category rename. **`getResults`:** each filter, OR within and AND across, facet counts that ignore their own selection, the three sorts, page slices and totals, a name match outranking a description match, "lea" → leather, "lether" → leather, "boots" → boot, a query with no results. `next/cache` is mocked. |
| End-to-end (Playwright, desktop and mobile) | **Filters:** a filter updates the URL, count and chips; Back undoes the sheet session; reload restores it. **Load more:** it appends, and `?page=2` restores. **Sort:** price sorting. **Search:** the panel (typing, a typo, Enter), and `/search`'s empty and no-results states. **Regression:** the existing 404 and overflow tests under Cache Components, and the M2 fixes. **Accessibility:** axe on a listing, the open sheet and the open search panel, with no serious or critical violations. |

## Performance budgets

Measured on the Vercel preview (`iad1`, next to Neon) and recorded in each PR from module 3 on:

| Measure | Budget |
|---|---|
| `/api/products` and `/api/search/suggest`, cached (`Server-Timing`) | < 50 ms server time |
| The same, uncached (first request for a query) | < 150 ms server time |
| Search panel: from the last keystroke to results on screen (warm cache) | < 300 ms, including the 200 ms debounce |
| Listing LCP (Chrome trace, mobile) | No worse than M2's |

## Docs and roadmap changes

- **Roadmap:** the open items for pagination style, price filter control and function region are marked resolved, with the decisions above. The caching paragraph changes from "ISR until M3" to Cache Components.
- **`CLAUDE.md`:**
  - the caching model (`"use cache"`, the `catalog` tag, no route segment configs);
  - the search index and its triggers;
  - `getResults` and the endpoints;
  - the URL state parsers;
  - the header search.

## Risks

| Risk | Mitigation |
|---|---|
| Streaming under Cache Components turns 404s into 200s (as `loading.tsx` did in M2) | The module 2 spike runs the existing 404 e2e tests before anything else, and stops if any fails. |
| Facet counts get slow as the catalogue grows | Every count comes from one `UNION ALL` query and is cached. At 48 products this is trivial, and the budget in each PR catches regressions. |
| Trigram matches are too loose or too strict | The threshold stays at pg_trgm's default 0.6, and the test cases ("lether", "boots", a nonsense word that matches nothing) pin the behaviour. |
| Pacer is beta | The version is pinned, and only `useDebouncedValue` is used. |

## Left to the plan

- **Ordering:** the exact task breakdown, file list and test-first order within each module.
- **Components:** which shadcn components need adding (`npx shadcn@latest add …`) and the colour-swatch map.
- **Content:** the popular searches list, chosen so each returns results.
