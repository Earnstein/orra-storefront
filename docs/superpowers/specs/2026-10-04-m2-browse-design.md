# Orra M2: browse (design)

- **Date:** 2026-10-04
- **Status:** awaiting review
- **Milestone:** M2 Browse → `v0.3.0`, as scoped in the [roadmap](2026-10-04-roadmap-to-live-design.md)
- **Scope of this spec:** the four M2 modules (error pages, collection pages, catalogue expansion, editorial pages): their behaviour, data, interfaces and tests. The M2 plan (`docs/superpowers/plans/2026-10-04-m2-browse.md`) turns them into tasks.
- **Not in this spec:** M3 Find (filters, sort, pagination and live search). It gets its own spec once M2 ships; the decisions already made for it are recorded in the roadmap.

## Intent

**What M2 is for:** shoppers can browse.
- Every primary-nav link opens a working page: a product listing, or an editorial landing page.
- The catalogue grows to 48 products, and each one carries the data M3's filters will need.
- Editorial pages (Women, Men and stories) make the store feel real.
- The 404 and error pages are styled.

**Decisions made while brainstorming:**

| Question | Decision |
|---|---|
| Source of the ~39 new product photos (the roadmap's open item for M2) | Free Unsplash photos (Unsplash License, never Unsplash+). Plain light backgrounds first; editorial shots where a category runs short (ready-to-wear is mostly shot on models). Each photo is checked at full size for logos and brand marks. The user approves a contact sheet before the seed is written. |
| Scope, after the user reviewed the first draft of this spec | The user asked for live search, pagination, advanced filtering and editorial landing pages. "Browse & find" was split: **M2 Browse** (this spec) and **M3 Find**. The later milestones move up one. |
| Tools for M3's live search, filters and pagination | nuqs (URL state), TanStack Query (fetching and caching) and TanStack Pacer (only `useDebouncedValue`). TanStack DB isn't used for search, because its client-side queries have no full-text search. Recorded in the roadmap. |
| Editorial pages | `/women` and `/men` landing pages, plus stories (a `/stories` index, the knitwear story and a second story). No gift guide. |
| How editorial content is authored | Typed blocks in code (`src/content/`), drawn by block components. No CMS and no MDX; a CMS could replace the source later without changing the components. |
| Data for M3's filters | Every product gets an audience, a colour family and a material. |
| How collection pages open | With a plain header, like New arrivals. The campaign photo opens `/women` and `/men` instead. |

The design was presented in sections, and the user approved each one: data; listings and navigation; editorial pages; modules, tests and roadmap.

**Superseded:** the first draft of this spec put filters, sort and search in M2, with the page re-rendered on the server for each filter change. That work moves to M3 with the tools above. The database still does the filtering, as the user chose.

**Assumptions** (presented and not corrected):
- Women and Men listings have category tabs.
- Jewellery and Ready-to-wear get listing pages, even though they aren't in the primary nav.
- Unisex products appear on both Women and Men.
- No pagination in M2: no M2 listing holds more than about 30 products, and M3 adds pagination.

## Exit criteria (from the roadmap)

1. On production, every primary-nav link (New in, Women, Men, Bags, Shoes, Accessories) leads to a working page: a listing, or the Women or Men landing page.
2. Every link in the homepage's sections resolves:
   - the hero buttons;
   - the featured collections;
   - New this season and its View all link;
   - the spotlight;
   - the story band.

   The header and footer still contain links to later milestones' pages: search (M3), account (M4), and help, legal and stores (M7).
3. The 48 products are live in production, after the release step.

Every pull request also meets the roadmap's definition of done:
- CI is green;
- it has been checked in the browser at 375, 1024, 1280 and 1440 px;
- it includes screenshots and the preview link;
- the user merges it.

## Out of scope

- Filters, sort, pagination and search, including the search document. These are all M3.
- A gift guide; a CMS or MDX; editorial pages beyond Women, Men and the two stories.
- `global-error.tsx`. The root layout has no data dependencies; `error.tsx` covers everything below it.
- SEO beyond each page's title, description and Open Graph image (M7).

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

| Column | Type | Module |
|---|---|---|
| `products.audience` | enum `audience`: `women`, `men`, `unisex`; not null | 2 |
| `products.colour_family` | enum `colour_family`: `black`, `white`, `grey`, `beige`, `brown`, `red`, `pink`, `orange`, `yellow`, `green`, `blue`, `purple`, `gold`, `silver`, `multicolour`; not null | 3 |
| `products.material` | enum `material`: `leather`, `suede`, `canvas`, `nylon`, `cotton`, `linen`, `wool`, `cashmere`, `silk`, `satin`, `gold`, `silver`, `metal`, `acetate`, `mixed`; not null | 3 |

- **How the fields are used:**
  - The Women and Men pages list their audience plus `unisex`.
  - `colour` stays the colour name shown to shoppers ("Tan", "Blue floral").
  - `colour_family` and `material` hold M3's filter values. In M2 nothing filters on them; the seed and the tests check them.
- **The lists can change before module 3 merges.** Values may be added when the contact sheet is reviewed. After that, adding a value takes a migration.

### Migrations and backfill

Production is migrated but never seeded, so each migration that adds a required column has to work on existing rows:
1. Add the column as nullable.
2. Fill in today's 9 products by slug. Any other row gets `unisex`, `multicolour` or `mixed`; none are expected, because production holds exactly the 9 seed products.
3. Set the column `NOT NULL`.

Migrations come from `npm run db:generate`, with the generated SQL edited by hand where it needs the backfill. They are applied with `db:migrate`, never `push`.

| Product (slug) | Audience | Colour family | Material |
|---|---|---|---|
| `top-handle-bag-teal` | women | green | leather |
| `double-monk-shoe` | men | brown | leather |
| `round-sunglasses` | unisex | gold | metal |
| `gold-hoop-earrings` | women | gold | gold |
| `leather-biker-jacket` | unisex | black | leather |
| `bomber-jacket-rust` | men | orange | nylon |
| `floral-pump` | women | blue | satin |
| `fringed-knit-poncho` | women | beige | cotton |
| `leather-tote-tan` | unisex | brown | leather |

The materials come from each product's existing details. The colour families and materials of these 9 can change at the contact-sheet review.

### Catalogue (module 3): 9 → 48 products

| Category | Bags | Shoes | Accessories | Jewellery | Ready-to-wear | Total |
|---|---|---|---|---|---|---|
| Today | 2 | 2 | 1 | 1 | 3 | 9 |
| Target | 10 | 10 | 10 | 8 | 10 | 48 |

- **Audience:** roughly half women, a third men, the rest unisex. Women and Men each have products in at least four categories, so their tabs and category tiles mean something.
- **Prices:** $250 to $3,500, stored as integer cents and spread widely enough for M3's price filter.
- **Colour families and materials:** spread so that M3's filters have several values to offer in most collections.
- **Stock:** mostly in stock, about 5 low (1–3 units, "Only N left") and about 3 sold out (0 units).
- **Photos:** as decided above.
  - Close-ups are cropped from the same photo by the existing `gallery()` helper.
  - Image URLs are bare Unsplash URLs, plus the helper's focal-point crop parameters.
- **Copy:** original names, descriptions and details, with no brand names and no text taken from other sites.
- **Order:** today's 9 products stay the newest (first in the seed), so the homepage's "New this season" doesn't change.
- **Contact sheet:** before the seed is written, the user approves one page listing every new product's photo, name, category, audience, colour, colour family, material, price and stock, plus the colour families and materials of the existing 9.

### Getting it to production

Production builds migrate but never seed. That's the M1 rule in `scripts/vercel-build-steps.ts`, and it stays.
- **Existing rows:** the migrations in modules 2 and 3 backfill them.
- **The 39 new products:** they reach production through one deliberate **release step** after module 3 merges.
  - The user runs `npm run db:seed -- --production` against the production database. The implementer gives step-by-step instructions at that point.
  - The seed upserts by slug. Production has no catalogue edits of its own yet (there's no admin), so nothing is lost.
  - From M6, the nightly demo reset applies the seed automatically.
- **Seed guard** (module 3, in `scripts/seed-catalog.ts`): `db:seed` refuses to run when `DATABASE_URL` points at the endpoint in `PRODUCTION_DB_HOST`, unless `--production` is passed.
  - It reuses the host normalisation that `scripts/vercel-build-steps.ts` already tests.
  - When `PRODUCTION_DB_HOST` is unset (CI), it runs as it does today.
  - Previews set `PRODUCTION_DB_HOST`, and their build guard already ensures they're on a different endpoint, so the seed guard never blocks them.

## Collection pages (module 2)

### Addresses

| Address | Lists | Category tabs |
|---|---|---|
| `/collections/new` | The newest 24 products (`NEW_ARRIVALS_PAGE_LIMIT`) | Categories present among them |
| `/collections/women`, `/collections/men` | That audience plus unisex | Categories present |
| `/collections/bags`, `shoes`, `accessories`, `jewellery`, `ready-to-wear` | That category, all audiences | None |
| `/collections/new/[category]`, `/collections/women/[category]`, `/collections/men/[category]` | The collection narrowed to one category | The same tabs, with the current one marked |

- **Which tabs appear:** the categories that have products in the collection.
- **When a page 404s:**
  - An unknown collection, or an unknown category under New, Women or Men.
  - Any second segment under a category page (`/collections/bags/shoes`).
  - A known category that has no products in that collection doesn't 404; it shows the empty state, as `/collections/new/[category]` does today.
- **Routes:** `src/app/collections/[collection]/page.tsx` and `src/app/collections/[collection]/[category]/page.tsx` replace `src/app/collections/new/`.
- **Resolver:** `resolveCollection(slug, categories)` in `src/lib/catalog/collections.ts` returns either `undefined` or a collection definition containing:
  - its kind (`new`, `audience` or `category`);
  - its title and copy;
  - whether it has tabs.
- **Reserved slugs:** `new`, `women` and `men` can't be category slugs. A seed test fails if a category uses one.
- **Copy:** each collection's title and one-line description live in `src/lib/content.ts`. Category titles come from the database.

### Page anatomy and rendering

- **All listings** use `ProductListing`. It shows:
  - the breadcrumb and heading;
  - an optional one-line description;
  - the optional tabs, which stay sticky under the header;
  - the item count and "Newest first";
  - the product grid, or the empty state.

  M3 adds the filter and sort bar.
- **Rendering:** listings are prerendered for every collection and tab, and revalidate every 5 minutes (`revalidate = 300`), as New arrivals does today. M3 changes how listings load their results.
- **Loading:** every listing route has a `loading.tsx` with heading and grid placeholders.

### Links that start working in module 2

- **Product pages:** the breadcrumb on every product page (`/collections/<category>`).
- **Homepage featured tiles:**
  - each tile gets its own link, instead of one built from a slug;
  - Women's outerwear → `/collections/women/ready-to-wear`;
  - Tailoring → `/collections/men/ready-to-wear`;
  - Leather shoes → `/collections/shoes`.
- **Primary nav and hero:** Women and Men point at `/collections/women` and `/collections/men` until module 4 moves them to the landing pages.

## Error pages (module 1)

- **`src/app/not-found.tsx`:**
  - The eyebrow "404", the heading "Page not found" and one line of copy.
  - Links to New in, Women and Men. They're taken from `primaryNav` in `src/lib/site.ts`, so they follow the nav's changes.
  - It's served with status 404 for unknown URLs and for every `notFound()`.
- **`src/app/error.tsx`** (a client component):
  - The heading "Something went wrong", one line of copy, a **Try again** button and a link to the homepage. **Try again** calls `retry()`, which re-fetches and re-renders the segment.
  - The error is logged to the console; shoppers see no error details.
  - The root layout sits outside this boundary, so the header and footer stay on screen.

## Editorial pages (module 4)

### Content model

- **Files:** `src/content/types.ts` defines the blocks. `src/content/landings.ts` holds Women and Men, and `src/content/stories.ts` holds the stories.

  | Block | Holds |
  |---|---|
  | `hero` | Image, phone and desktop focal points, optional eyebrow, title, optional line of copy, optional action (label and href) |
  | `categoryTiles` | Heading, then tiles. Each tile has a label, an href and the slug of the product whose photo it shows |
  | `productRow` | Heading, product slugs (hand-picked, in order), optional action |
  | `story` | Image, title, copy and action (photo plus text, like the homepage story band) |
  | `text` | Optional heading, paragraphs, optional action |
  | `image` | Image, optional caption, width `full` or `inset` |
  | `quote` | Text, optional attribution |

- **Rendering:** `src/components/editorial/` has one server component per block and an `EditorialBlocks` renderer. The renderer switches on the block type, and the switch is exhaustive, so a new block type without a component fails the typecheck.
- **Product rows and tiles:** both load products through a new `getProductsBySlugs(slugs)` in `src/lib/catalog/queries.ts`.
  - It returns products in the order given and skips slugs it doesn't know.
  - A sold-out product still appears, marked "Sold out" like any card.
- **Images:** they use the existing `Media` primitive and image loader. Every image has alt text.

### `/women` and `/men`

- **Routes:** `src/app/women/page.tsx` and `src/app/men/page.tsx` render their entry in `landings.ts`.
- **Blocks, in order:**
  1. **`hero`:** the homepage hero photo for that audience, with its phone and desktop crops. A line of copy and **Shop all women** (or men) → `/collections/women` (or men).
  2. **`categoryTiles`, "Shop by category":** the categories that have products for that audience, each linking to `/collections/women/<category>`. Each tile shows a chosen product's photo.
  3. **`productRow`, "The edit":** 8 hand-picked products.
  4. **`story`:** a story block linking to one of the stories.
  5. **`text`:** a closing line with **Shop all women** (or men) → `/collections/women` (or men).
- **Rendering and metadata:** ISR (`revalidate = 300`), because the product rows read the database. Each page has its own title, description and Open Graph image (the hero photo).

### Stories

- **Routes:**
  - `src/app/stories/page.tsx`, the index: a heading, an intro line, and a card per story (image, title, intro, link).
  - `src/app/stories/[slug]/page.tsx`, built at build time from `stories.ts` (`generateStaticParams`, `dynamicParams = false`), so unknown slugs 404.
- **The two stories:**
  - **"Knitwear, made slowly"** (`/stories/knitwear`) uses the homepage story band's title, copy and photo, plus new photos.
  - **"The leather workshop"** (`/stories/leather-workshop`) follows how the bags are made.
- **Each story page:**
  - a `hero` with the title and an intro line;
  - then `text`, `image` and `quote` blocks;
  - then **Shop the story**, a `productRow`;
  - and a link to the other story.
- **Single source for the homepage band:** the story band's content comes from the knitwear story's entry, so the two can't drift apart.

### Navigation changes in module 4

- **Primary nav:** Women → `/women`, Men → `/men`.
- **Homepage hero:** "Shop women" → `/women`, "Shop men" → `/men`.
- **Footer:** the About group gains **Stories** → `/stories`.

### Photos and copy

- **Photos:** new editorial photos are free Unsplash photos, each checked for logos. They go on their own contact sheet for the user's approval before they're used.
- **Copy:** all copy is original and written by the implementer. The user reviews it on the preview.
- **Design:** before building, the implementer looks at Gucci UK's women's landing and editorial pages, then adapts their patterns using our primitives and tokens, without copying text, images or branding.

## Modules

First, this spec and the M2 plan go on the branch `docs/m2-browse` as one pull request; that PR also carries the roadmap update. The user merges it before module 1 starts.

Each module is one branch and one pull request, assigned to the GitHub Milestone "M2 · Browse", in this order:

| # | Branch | Delivers |
|---|---|---|
| 1 | `feat/error-pages` | `not-found.tsx` and `error.tsx`. |
| 2 | `feat/collection-pages` | `audience` (with backfill); the collection resolver and routes (replacing `src/app/collections/new/`); category pages and tabs; `loading.tsx`; the featured tiles' direct links. **Needs the `dev` database branch first.** |
| 3 | `feat/catalogue-expansion` | `colour_family` and `material` (with backfill); the seed guard; the contact sheet and its approval; 39 new products. **Release step after merge:** the seed is run once against production. |
| 4 | `feat/editorial-pages` | The content model and block components; `getProductsBySlugs`; `/women`, `/men`, `/stories` and the two stories; the editorial contact sheet; the navigation changes. The plan may split this into landing pages and stories if it grows large. |

**After the last merge:**
1. Tag `v0.3.0` and publish the GitHub Release.
2. Add the entry to `docs/milestones.md` and close the GitHub Milestone.
3. Run the exit check on production, after the release step.

## Testing

Tests are written first for every behaviour a task introduces (red, then green).

| Layer | Covers |
|---|---|
| Unit (Vitest) | `resolveCollection`: every collection kind, reserved slugs, unknown slugs. The seed guard: the production host is refused without `--production`; other hosts and an unset variable are allowed. Editorial content integrity: every product and category slug the content mentions exists in the seed; every internal href matches a route that exists; story slugs are unique; every image is an Unsplash URL in the expected form and has alt text. |
| Database (Vitest + PGlite, real migrations + seed) | Each collection's listing: Women includes unisex; New is limited to the newest 24; a tab narrows to its category. `getProductsBySlugs` keeps the given order and skips unknown slugs. Each backfill fills rows that existed before its migration. |
| Seed | 48 products, meeting the per-category targets. Unique slugs. Every product has an audience, a colour family and a material. No category uses a reserved slug. Every image is an Unsplash URL in the expected form. |
| End-to-end (Playwright, desktop + mobile) | Every primary-nav link returns 200 with a heading. Listings show products, and Women shows a unisex product. `/women` and `/men` show their tiles and product rows, and Shop all leads to the listing. `/stories` lists both stories; a story's products link to their product pages; an unknown story 404s. The styled 404. No horizontal overflow on the new pages. Module 3 updates the existing assertions that count today's 9 products. |
| Browser checks | 375, 1024, 1280 and 1440 px, with spacing measured against the tokens (`gutter`, `section`, `block`, `tile`, `header`) and no console errors. Every PR has desktop and mobile screenshots. |

`error.tsx` is checked by hand, by throwing in a page during local development; the PR records the check.

M1's deferred minors are fixed in the files M2 touches anyway:
- The e2e overflow check uses `clientWidth`.
- `src/test/db.ts` resolves the migrations folder from the file, not the working directory.
- The categories-order test fails if the query loses its `ORDER BY`.

## Docs and roadmap changes

- **The roadmap,** in the spec pull request:
  - "Browse & find" is split into M2 Browse and M3 Find, and later milestones move up one (Accounts M4, Bag & checkout M5, Admin M6, Launch M7), with every cross-reference renumbered.
  - M3's scope and tools are recorded: nuqs, TanStack Query, TanStack Pacer, `pg_trgm`, and the GET endpoint.
  - TanStack DB's evaluation is recorded.
  - The data table changes: `audience`, `colour_family` and `material` in M2; the search document in M3.
  - The "Reads and writes" rule changes.
  - New open items for M3: the pagination style, the price filter control, and the function region.
- **`CLAUDE.md`:**
  - In the spec pull request, "M2–M6" becomes "M2–M7".
  - Then, with each module that changes something it describes:
    - collections and the resolver;
    - the new product fields;
    - the seed guard and the release step;
    - `.env.local` for local development;
    - the editorial content model.
- **`docs/milestones.md`:** the `v0.3.0` entry when the milestone closes.

## Risks

- **Photo supply.** Module 3 needs about 39 product photos and module 4 about 10 editorial photos, each free of brand marks. There may be too few plain-background product photos, especially for ready-to-wear; editorial shots fill the gap, as decided.
- **The release step is manual.** If the production seed run is skipped, production shows 9 products and the exit check fails. It's on module 3's PR checklist and in the milestone's closing steps.
- **Editorial copy and quality.** The landing pages and stories are judged on taste. The user reviews them on the preview, and Gucci's pages are the reference.
- **Module 4's size.** It's the largest module; the plan may split it in two.

## Left to the plan

- How the existing new-arrivals code is split between `ProductListing` and the new collection components.
- Whether `/women` and `/men` are two route files or one shared component behind them.
- How each backfill migration is written, and how the backfill tests apply the migrations in two steps, inserting old-shape rows in between.
- The format of the two contact sheets.
