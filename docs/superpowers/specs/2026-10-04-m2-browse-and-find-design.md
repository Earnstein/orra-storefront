# Orra M2: browse & find (design)

- **Date:** 2026-10-04
- **Status:** awaiting review
- **Milestone:** M2 → `v0.3.0`, as scoped in the [roadmap](2026-10-04-roadmap-to-live-design.md)
- **Scope of this spec:** the five M2 modules (error pages, collection pages, catalogue expansion, filter and sort, search): their behaviour, data, interfaces and tests. The M2 plan (`docs/superpowers/plans/2026-10-04-m2-browse-and-find.md`) turns them into tasks.

## Intent

**What M2 is for** (from the roadmap): shoppers can find things. Every primary-nav link opens a working listing. Listings can be filtered and sorted, with the state in the URL. Search finds products by name, colour and category. The 404 and error pages are styled.

**Decisions made while brainstorming:**

| Question | Decision |
|---|---|
| Source of the ~40 new product photos (the roadmap's open item for M2) | Free Unsplash photos (Unsplash License, never Unsplash+). Plain light backgrounds first; editorial shots where a category runs short (ready-to-wear is mostly shot on models). Each photo is checked at full size for logos and brand marks. The user approves a contact sheet before the seed is written. |
| How far header search goes | A panel with a text box, suggested searches and quick links; Enter opens the results page. No live results as you type. |
| How collection pages open | Women and Men open with a campaign band that reuses the homepage hero photos. Category pages are plain, like New arrivals. |
| Where filtering and sorting happen | **In the database** (approach B). Listing pages render per request from data cached for 5 minutes. This replaces the roadmap's "listings stay ISR"; product pages and the homepage stay ISR. |

The design was presented in five sections (data; pages and routes; filter and sort; search; modules, tests and docs), and the user approved each one.

**Assumptions** (presented and not corrected):
- Women and Men are product listings with category tabs, not editorial landing pages.
- Jewellery and Ready-to-wear get pages even though they aren't in the primary nav.
- Unisex products appear on both Women and Men.
- No pagination: no listing holds more than about 30 products.

## Exit criteria (from the roadmap)

1. On production, every primary-nav link (New in, Women, Men, Bags, Shoes, Accessories) leads to a working listing.
2. On production, search finds products by name, by colour and by category.

Every pull request also meets the roadmap's definition of done:
- CI is green;
- it has been checked in the browser at 375, 1024, 1280 and 1440 px;
- it includes screenshots and the preview link;
- the user merges it.

## Out of scope

- Live search results.
- Pagination.
- Size, material or audience filters on category pages.
- A "Recommended" sort.
- Editorial landing pages.
- `global-error.tsx`. The root layout has no data dependencies; `error.tsx` covers everything below it.
- SEO work such as the sitemap and canonical URLs, which belong to M6. `/search` is still marked noindex in M2.

The roadmap's out-of-scope list (variants, reviews and the rest) still applies.

## Prerequisite: a database branch for local work

M2 changes the schema from module 2 on, and local work must never touch production. The local `.env` most likely points at the production database. So before module 2 starts, the following steps happen. They bring forward an item that `docs/milestones.md` (v0.2.0) carried forward to "before M3".

1. The user creates a Neon branch named `dev` from `production` in the Neon console.
2. The user puts the `dev` connection string in a new `.env.local`, together with `PRODUCTION_DB_HOST` (used by the seed guard below).
   - `.env.local` is git-ignored.
   - Next, drizzle-kit and the seed script all read it before `.env`.
   - The user's own dev server moves to `dev` as well.
3. The implementer migrates and seeds `dev` from a worktree. Worktrees symlink both env files; the implementer never reads them.

## Data

### Schema (`src/db/schema/catalog.ts`)

| Column | Type | Module | Notes |
|---|---|---|---|
| `products.audience` | enum `audience`: `women`, `men`, `unisex`; not null | 2 | The Women and Men pages list their audience plus `unisex`. |
| `products.colour_family` | enum `colour_family`: `black`, `white`, `grey`, `beige`, `brown`, `red`, `pink`, `orange`, `yellow`, `green`, `blue`, `purple`, `gold`, `silver`, `multicolour`; not null | 3 | The colour filter's values. `colour` stays the name shown to shoppers ("Tan", "Blue floral"). |
| `products.search` | `tsvector` with GIN index `products_search_idx`, filled by a trigger | 5 | Application code never sets it. |

Two refinements to the roadmap; its data table is updated to match.

- **`colour_family` is new.** Free-text colours can't drive a filter: today's 9 products already use 8 different colour names.
- **`search` is kept current by a trigger, not a generated column.** A generated column can only read its own row, and the category name lives in `categories`.
  - The trigger runs before every insert and update on `products`. It builds the search document from:
    - **weight A:** the name;
    - **weight B:** the colour, the colour family, the category name and audience words (`women` → "women", `men` → "men", `unisex` → "unisex women men", so "women bags" also finds unisex bags, as the Women page does);
    - **weight C:** the description and the `value` of each detail.
  - A second trigger re-indexes a category's products when the category is renamed.
  - Checked on PGlite 0.5.8 (Postgres 18): enums, plpgsql triggers, English stemming and prefix queries all work, so the tests exercise the real trigger. A test query for "black bags" found a black tote whose category is Bags.

### Migrations and backfill

Production is migrated but never seeded, so each migration that adds a required column has to work on existing rows:
1. Add the column as nullable.
2. Fill in today's 9 products by slug. Any other row gets `unisex` or `multicolour`; none are expected.
3. Set the column `NOT NULL`.

The search migration creates the trigger functions and then touches every row, so existing products get their search document.

Migrations come from `npm run db:generate`. Where a migration needs the backfill, its generated SQL is edited by hand, and the trigger SQL goes in a custom migration (`drizzle-kit generate --custom`). They are applied with `db:migrate`, never `push`.

| Product (slug) | Audience | Colour family |
|---|---|---|
| `top-handle-bag-teal` | women | green |
| `double-monk-shoe` | men | brown |
| `round-sunglasses` | unisex | gold |
| `gold-hoop-earrings` | women | gold |
| `leather-biker-jacket` | unisex | black |
| `bomber-jacket-rust` | men | orange |
| `floral-pump` | women | blue |
| `fringed-knit-poncho` | women | beige |
| `leather-tote-tan` | unisex | brown |

The colour families of these 9 can change at the contact-sheet review in module 3.

### Catalogue (module 3): 9 → 48 products

| Category | Bags | Shoes | Accessories | Jewellery | Ready-to-wear | Total |
|---|---|---|---|---|---|---|
| Today | 2 | 2 | 1 | 1 | 3 | 9 |
| Target | 10 | 10 | 10 | 8 | 10 | 48 |

- **Audience:** roughly half women, a third men, the rest unisex. Women and Men each have products in at least four categories, so their tabs mean something.
- **Prices:** $250 to $3,500, stored as integer cents and spread so that most collections have products in most price bands.
- **Stock:** mostly in stock, about 5 low (1–3 units, "Only N left") and about 3 sold out (0 units).
- **Photos:** as decided above.
  - Close-ups are cropped from the same photo by the existing `gallery()` helper.
  - Image URLs are bare Unsplash URLs, plus the helper's focal-point crop parameters.
- **Copy:** original names, descriptions and details, with no brand names and no text taken from other sites.
- **Order:** today's 9 products stay the newest (first in the seed), so the homepage's "New this season" doesn't change.
- **Contact sheet:** before the seed is written, the user approves one page listing every new product's photo, name, category, audience, colour, colour family, price and stock, plus the colour families of the existing 9.

### Getting it to production

Production builds migrate but never seed. That's the M1 rule in `scripts/vercel-build-steps.ts`, and it stays.
- **Existing rows:** the migrations in modules 2, 3 and 5 backfill them.
- **The 39 new products:** they reach production through one deliberate **release step** after module 3 merges.
  - The user runs `npm run db:seed -- --production` against the production database. The implementer gives step-by-step instructions at that point.
  - The seed upserts by slug. Production has no catalogue edits of its own yet (there's no admin), so nothing is lost.
  - From M5, the nightly demo reset applies the seed automatically.
- **Seed guard** (module 3, in `scripts/seed-catalog.ts`): `db:seed` refuses to run when `DATABASE_URL` points at the endpoint in `PRODUCTION_DB_HOST`, unless `--production` is passed.
  - It reuses the host normalisation that `scripts/vercel-build-steps.ts` already tests.
  - When `PRODUCTION_DB_HOST` is unset (CI), it runs as it does today.
  - Previews set `PRODUCTION_DB_HOST`, and their build guard already ensures they're on a different endpoint, so the seed guard never blocks them.

## Pages and routes

### Addresses

| Address | Lists | Category tabs |
|---|---|---|
| `/collections/new` | The newest 24 products (`NEW_ARRIVALS_PAGE_LIMIT`) | Categories present among them |
| `/collections/women`, `/collections/men` | That audience plus unisex | Categories present |
| `/collections/bags`, `shoes`, `accessories`, `jewellery`, `ready-to-wear` | That category, all audiences | None |
| `/collections/new/[category]`, `/collections/women/[category]`, `/collections/men/[category]` | The collection narrowed to one category | The same tabs, with the current one marked |

- **Which tabs appear:** the categories with products in the collection, ignoring any filters, so tabs don't come and go as filters change.
- **When a page 404s:**
  - An unknown collection, or an unknown category under New, Women or Men.
  - Any second segment under a category page (`/collections/bags/shoes`).
  - A known category that has no products in that collection doesn't 404; it shows the empty state, as `/collections/new/[category]` does today.
- **Routes:** `src/app/collections/[collection]/page.tsx` and `src/app/collections/[collection]/[category]/page.tsx` replace `src/app/collections/new/`.
- **Resolver:** `resolveCollection(slug, categories)` in `src/lib/catalog/collections.ts` returns either `undefined` or a collection definition containing:
  - its kind (`new`, `audience` or `category`);
  - its title and copy;
  - the campaign image, for Women and Men;
  - whether it has tabs.
- **Reserved slugs:** `new`, `women` and `men` can't be category slugs. A seed test fails if a category uses one.
- **Links that start working:** the breadcrumb on every product page (`/collections/<category>`), the homepage hero and featured collections, and the primary nav.
- **Copy:** titles, one-line descriptions and campaign-image references live in `src/lib/content.ts`. Category titles come from the database.

### Page anatomy

- **All listings** use `ProductListing`, extended. It contains:
  - the breadcrumb and heading;
  - the optional tabs, which stay sticky under the header;
  - the bar (item count and **Filter and sort**) and the filter chips;
  - the grid, or the empty state.
- **Women and Men** open with a campaign band.
  - The photo is the homepage hero photo for that audience.
  - The title (`<h1>`) and one line of copy sit over the image with the hero's scrim and `text-on-image`.
  - **Size and crop:** below `md`, the band is 4:3 and uses the phone focal point. From `md` up, it's about 60% of the viewport height and uses the desktop focal point. This is the same switch the hero makes.
  - The image loads eagerly.
  - The breadcrumb, tabs and products follow it.
- **Category pages and New arrivals:** a plain header, as New arrivals has today.
- **Loading:** every listing route has a `loading.tsx` with heading and grid placeholders, so navigation responds at once.

### Rendering and caching

- **Module 2:** collection pages are prerendered and revalidate every 5 minutes, as New arrivals does today.
- **From module 4:** listing pages read `searchParams`, so they render per request.
  - Query functions in `src/lib/catalog/` stay plain async functions, tested against PGlite.
  - Pages call thin cached wrappers (`unstable_cache` from `next/cache`, 5-minute revalidation, tag `catalog`), so repeat views don't hit the database.
  - M5's admin writes call `revalidateTag("catalog")`.
- **Product pages and the homepage** stay ISR (`revalidate = 300`).

### Error pages (module 1)

- **`src/app/not-found.tsx`:**
  - The eyebrow "404", the heading "Page not found", one line of copy, and links to New in, Women and Men.
  - It's served with status 404 for unknown URLs and for every `notFound()`.
  - Module 5 adds a search form.
- **`src/app/error.tsx`** (a client component):
  - The heading "Something went wrong", one line of copy, a **Try again** button and a link to the homepage. **Try again** calls `retry()`, which re-fetches and re-renders the segment.
  - The error is logged to the console; shoppers see no error details.
  - The root layout sits outside this boundary, so the header and footer stay on screen.

## Filter and sort (module 4)

### URL state

Example: `/collections/women/bags?colour=black,brown&price=500-1000&stock=in&sort=price-asc`

| Param | Values | Used on |
|---|---|---|
| `colour` | Colour families, comma-separated | Listings and search |
| `price` | Price band ids, comma-separated | Listings and search |
| `stock` | `in` = in stock only | Listings and search |
| `category` | Category slugs, comma-separated | Search only (listings use tabs) |
| `sort` | `newest` (listing default), `price-asc`, `price-desc`; `relevance` (search default, search only) | Listings and search |
| `q` | The search text | Search only |

`parseListingParams` and `writeListingParams` live in `src/lib/catalog/listing-params.ts`. They are pure and unit-tested:
- unknown parameters and values are dropped, and duplicates are removed;
- values are kept in a fixed order, and default values are omitted, so the same state always produces the same URL;
- invalid input never causes an error.

### Price bands

| Id | Label | Price (cents) |
|---|---|---|
| `0-500` | Under $500 | 0–49,999 |
| `500-1000` | $500–$999 | 50,000–99,999 |
| `1000-2000` | $1,000–$1,999 | 100,000–199,999 |
| `2000-up` | $2,000 and over | 200,000 and above |

Module 4 may move these boundaries to fit the final catalogue, so that most collections have products in most bands.

### Queries

`getListing(scope, params)` in `src/lib/catalog/listing.ts` runs two queries in parallel.

1. **Products:** rows in the scope that pass the filters, ordered by the sort. Ties fall back to `created_at` descending, then `id`, so the order never jumps between requests.
   - **New:** the newest 24 by `created_at` descending, then `id`.
   - **Audience:** `audience IN (<audience>, 'unisex')`.
   - **Category:** that category.
   - **Search:** `search @@ <query>`.
   - On tab pages, the scope is narrowed to the tab's category.
   - **Relevance sort:** `ts_rank(search, <query>)` descending.
2. **Counts:** one statement over the scope with a `count(*) FILTER (WHERE …)` per option.
   - Each group's counts apply every other group's filters but not its own. Within a group, choices widen the results (OR); across groups they narrow them (AND). So ticking Black doesn't zero Brown.
   - The same statement returns the in-stock count and the total that the **Show N items** button uses.

In the drawer, an option with a count of 0 is disabled unless it's already selected.

### The bar, chips and drawer

- **The bar:** "18 items" on the left. On the right, a **Filter and sort** button showing the number of active filters, e.g. "(2)".
- **Chips:** when filters are on, a chip row sits under the bar.
  - There's one chip per value ("Black ×", "$500–$999 ×", "In stock only ×"), plus **Clear all**.
  - Sort isn't a chip.
  - **Clear all** removes the filters but keeps the sort and the search text.
- **The drawer:** a `Sheet` from the right, full width below `sm`. It contains:
  - the title "Filter and sort" and a **Clear all** link;
  - an **In stock only** switch;
  - accordion groups: **Category** (search only), **Colour** (swatch, name and count, three per row), **Price** (checkboxes with counts) and **Sort by** (a radio group);
  - a **Show 18 items** button pinned to the bottom, which closes the drawer.
- **New components:** shadcn (Base UI) `switch`, `checkbox` and `radio-group`.
- **Swatches:**
  - One hex value per colour family, in `src/lib/catalog/colours.ts`. These describe products, and they're the only raw colours in the UI.
  - Multicolour is a split swatch, and light swatches get a hairline border.
- **Applying changes:** every change applies immediately.
  - The URL updates inside a transition and the server re-renders.
  - The grid behind the drawer and all the counts update, and the drawer stays open.
  - The button shows a busy state until the update lands.
- **Accessibility:**
  - every control has a label;
  - focus is trapped inside the drawer and goes back to the button when it closes;
  - Esc closes the drawer;
  - count changes are announced through a polite live region.

### History, tabs and scroll

- **History:**
  - Each time the drawer is opened, at most one history entry is added: the first change pushes, and later ones replace. So Back restores the page as it was before the drawer opened.
  - Removing a chip and **Clear all** add one entry each.
- **Tabs:** tab links keep the current filters and sort.
- **Scrolling:**
  - The page doesn't scroll while the drawer is open.
  - When the drawer closes, if the top of the grid is above the viewport, the page scrolls to it.
- **Loading:** filter changes keep the current grid on screen until the new one is ready. The loading skeleton is for navigation between pages, not for filter changes.

### No matches

The message "No items match these filters." and a **Clear filters** button.

## Search (module 5)

### Turning text into a query

`buildSearchQuery(text)` in `src/lib/catalog/search-query.ts` is pure and unit-tested. It returns the input for `to_tsquery('english', …)`, or `null`.
- **Cleaning:**
  - It lowercases the text and keeps the first 100 characters.
  - It splits on anything that isn't a letter or a digit, so nothing typed can inject query syntax.
  - It keeps at most 6 words.
- **Synonyms:** `jewelry` → `jewellery`, `color` → `colour`, `gray` → `grey`, including plurals. The store spells the British way, but its locale is en-US.
- **Matching:**
  - Every word has to match, and each one matches as a prefix, e.g. `black:* & bag:*`.
  - Postgres stems words, so "bags" matches "bag" and "earrings" matches "earring".
- **When it returns `null`:** when no usable word is left (e.g. "!!!" or empty input). The page then shows the empty-search state.
- **Stop words:** Postgres ignores words like "the". A query made only of stop words matches nothing, so it shows the no-results state.

### Ranking, sort and filters

- **Default sort:** `relevance` (`ts_rank` descending, then newest). Because of the weights, a match in the name outranks a match in the description.
- **Other sorts:** Newest, Price low to high and Price high to low.
- **Filters:** the same as listings, plus the Category group.

### Header panel

- **Opening:** the search icon in `SiteHeader` opens a panel from the top, full screen on phones. It contains:
  - a large text box, which takes focus;
  - **Close**;
  - about five suggested searches, for example Bags, Black, Gold and Leather. They're kept in `content.ts` and chosen after the catalogue expansion, and a test checks that each one returns results;
  - links to New in, Women and Men.
- **The form:** a GET form to `/search` (`next/form`), so Enter works before scripts load. Underneath, the icon stays a real link to `/search`.
- **Closing:** Esc and **Close** shut the panel, and focus returns to the icon.

### Results page: `/search`

- **Rendering:** `src/app/search/page.tsx` renders per request, with data cached in the same way as listings. It has its own `loading.tsx`.
- **Layout:**
  - the search form, prefilled with the query;
  - the heading "Results for “black bags”";
  - the count, the bar, the chips and the grid.
- **Without usable text:** the form and the suggested searches.
- **With no results:** "No results for “…”", the suggested searches, and a link to New arrivals.
- **Metadata:** the title "Search" or "Results for …", and `robots: noindex`.
- **The 404 page:** `not-found.tsx` gains the same search form.

## Modules

First, this spec and the M2 plan go on the branch `docs/m2-browse-and-find` as one pull request; that PR also carries the roadmap updates below. The user merges it before module 1 starts.

Each module is one branch and one pull request, assigned to the GitHub Milestone "M2 · Browse & find", in this order:

| # | Branch | Delivers |
|---|---|---|
| 1 | `feat/error-pages` | `not-found.tsx` and `error.tsx`. |
| 2 | `feat/collection-pages` | `audience` (with backfill); the collection resolver and routes (replacing `src/app/collections/new/`); the Women and Men campaign band; category pages; `loading.tsx`. Pages stay ISR. **Needs the `dev` database branch first.** |
| 3 | `feat/catalogue-expansion` | `colour_family` (with backfill); the seed guard; the contact sheet and its approval; 39 new products. **Release step after merge:** the seed is run once against production. |
| 4 | `feat/filter-sort` | The URL params; `getListing` and its counts; the cached wrappers (listings now render per request); the bar, chips and drawer; the no-matches state; tabs that keep filters. |
| 5 | `feat/search` | The `search` column, triggers and GIN index; `buildSearchQuery`; the header panel; `/search`; the search form on the 404 page. |

**After the last merge:**
1. Tag `v0.3.0` and publish the GitHub Release.
2. Add the entry to `docs/milestones.md` and close the GitHub Milestone.
3. Run the exit check on production.

## Testing

Tests are written first for every behaviour a task introduces (red, then green).

| Layer | Covers |
|---|---|
| Unit (Vitest) | `parseListingParams` / `writeListingParams` (dropping invalid values, fixed order, defaults omitted); price-band mapping; `buildSearchQuery` (cleaning, word limit, synonyms, prefixes, `null`); `resolveCollection` (every collection kind, reserved slugs, unknown slugs); the seed guard (production host refused without `--production`, other hosts allowed, unset variable allowed). |
| Database (Vitest + PGlite, real migrations + seed) | Each collection's listing: Women includes unisex; New is limited to the newest 24; tabs narrow the results. Every filter and sort, including tie order. Counts: ticking Black doesn't zero Brown, and the total matches the results. Search finds products by name, colour and category, by prefix and by US spelling; a name match outranks a description match; the document updates when a product is edited and when a category is renamed. The backfill fills rows that existed before each migration. |
| Seed | 48 products, meeting the per-category targets. Unique slugs. Every product has an audience and a colour family. No category uses a reserved slug. Every image is an Unsplash URL in the expected form. |
| End-to-end (Playwright, desktop + mobile) | Every primary-nav link returns 200 with a heading and at least one product. Women shows a unisex product. A colour filter changes the URL and the count, and Back restores the previous state. Price high to low comes back in order. Search from the header panel finds by name, by colour and by category. The no-results state. The styled 404. No horizontal overflow on the new pages. Module 3 updates the existing assertions that count today's 9 products. |
| Browser checks | 375, 1024, 1280 and 1440 px, with spacing measured against the tokens (`gutter`, `section`, `block`, `tile`, `header`) and no console errors. Every PR has desktop and mobile screenshots. |

`error.tsx` is checked by hand, by throwing in a page during local development; the PR records the check.

M1's deferred minors are fixed in the files M2 touches anyway:
- The e2e overflow check uses `clientWidth`.
- `src/test/db.ts` resolves the migrations folder from the file, not the working directory.
- The categories-order test fails if the query loses its `ORDER BY`.

## Docs and roadmap changes

- **The roadmap,** in the spec pull request:
  - Its status line becomes "approved", with a note that this spec amends it.
  - In the M2 module table:
    - the audience field moves to Category pages;
    - Catalogue expansion gains `colour_family` and the production seed step;
    - Search uses the trigger-maintained document.
  - The M5 product form gains colour family.
  - The M2 row of the data table changes to match.
  - The "Reads and writes" rule now reads: listings and search render per request from cached data, and product pages and the homepage stay ISR.
  - The "Product photography" open item is marked settled, with a link here.
- **`CLAUDE.md`,** with each module that changes something it describes:
  - collections and the resolver;
  - listing params and the `catalog` cache tag;
  - search and its trigger;
  - the seed guard and the release step;
  - `.env.local` for local development.
- **`docs/milestones.md`:** the `v0.3.0` entry when the milestone closes.

## Risks

- **Database wake-up.** The free Neon database suspends when idle, so the first listing request after a quiet spell can take about a second. The 5-minute cache covers repeat views.
- **Photo supply.** There may be too few plain-background photos, especially for ready-to-wear. Editorial shots fill the gap, as decided.
- **Skeleton flash on filter changes.** A filter navigation might show `loading.tsx` instead of keeping the current grid. Module 4 checks this in the browser; keeping the grid on screen is a requirement.
- **The release step is manual.** If the production seed run is skipped, production shows 9 products and the exit check fails. It's on module 3's PR checklist and in the milestone's closing steps.

## Left to the plan

- How the existing new-arrivals code is split between `ProductListing` and the new components.
- The drawer's history calls (`router.push`/`replace` versus `history.pushState`) that achieve the behaviour above.
- Whether each backfill is written by editing generated migration SQL or as a custom migration.
- How the backfill tests apply the migrations in two steps, inserting old-shape rows in between.
- The format of the contact sheet.
