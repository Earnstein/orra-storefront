# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project state

Next.js 16 (App Router, `src/`, `@/*` → `src/*`) e-commerce app. Storefront UI (homepage, product pages) is built on a Postgres catalogue (products, categories, stock); Better Auth has email + password enabled (no sign-in UI yet); there is no cart/order backend yet. Tests: Vitest unit tests and catalogue query tests against PGlite. Package manager is **npm**.

## Commands

```bash
npm run dev              # Next dev server (Turbopack)
npm run build            # production build — needs DATABASE_URL + BETTER_AUTH_* set and a migrated, seeded database (see below)
npm run lint             # ESLint (next + TanStack Query rules)
npm run typecheck        # next typegen && tsc --noEmit (typegen is required for LayoutProps/PageProps)
npm test                 # Vitest, once (src/**/*.test.ts, scripts/**/*.test.ts)
npm run test:watch       # Vitest in watch mode
npm run test:e2e         # Playwright smoke tests (desktop + mobile); needs `npm run build` and a seeded DB, serves on :3100 (or set E2E_BASE_URL)

npm run auth:generate    # Better Auth tables → src/db/schema/auth.ts
npm run db:generate      # drizzle-kit migration from schema (add `-- --name <name>`)
npm run db:migrate       # apply migrations; refuses production unless `-- --production` (allowed in Vercel production builds)
npm run db:push | db:studio
npm run db:seed          # upsert the initial catalogue (src/db/seed/catalog.ts) by slug; refuses production unless `-- --production`
npm run db:seed -- --check   # print whether DATABASE_URL points at production (doesn't connect)

npx intent list                              # TanStack agent skills
npx intent load <package>#<skill>
npm run skills:update                        # update the shadcn skill (skills CLI)
npx shadcn@latest add <component>
```

Tests: Vitest (`vitest.config.mts`, Node environment, no React plugin). `@/…` resolves to `src/`, and `server-only` is aliased to `src/test/server-only.ts` so server modules can be imported in tests.

## How we ship

Roadmap and process: `docs/superpowers/specs/2026-10-04-roadmap-to-live-design.md`. Each milestone gets its own plan in `docs/superpowers/plans/` (M2–M7 also get their own spec), approved before any code is written.
- One module = one branch (`feat/…`, `fix/…`, `docs/…`, `chore/…`) = one PR, assigned to its GitHub Milestone; the PR template's checklist must be complete.
- The user approves by **squash-merging**; never merge PRs yourself. Every `git push` needs the user's approval.
- When a milestone's last PR merges: tag `vX.Y.0`, publish a GitHub Release, add an entry to `docs/milestones.md`.
- Stage files by path (never `git add -A`); the user installs things in the working tree in parallel.
- Environments: CI (`.github/workflows/ci.yml`) builds and tests on a throwaway, expiring `ci-*` Neon branch with credentials masked. Vercel previews get their own Neon branch via the Neon integration and are migrated **and seeded**; production is migrated but **never seeded** (`vercel.json` → `scripts/vercel-build.ts`, steps in `vercel-build-steps.ts`). A preview build stops before touching any database unless `DATABASE_URL`'s host differs from `PRODUCTION_DB_HOST`, so it can never migrate or seed production.
- Local development uses the Neon `dev` branch. `.env.local` sets `DATABASE_URL` to it, and Next, the npm `db:*` scripts and the seed script read `.env.local` before `.env`. `.env` keeps production's URL plus `PRODUCTION_DB_HOST`, which `db:seed` and `db:migrate` check (`scripts/db-target.ts`). They refuse production unless run with `-- --production`, which in turn refuses any database that isn't confirmed as production. Both print which database they're about to touch. `npm run db:seed -- --check` prints which database `DATABASE_URL` points at, and must say `not production` before local database work. Worktrees symlink both files; never read them.

## Architecture

**Env** — `src/lib/env.ts` validates with Zod. `serverEnv()` is a function that parses on call (throws if invalid); `clientEnv` holds `NEXT_PUBLIC_*` and is parsed at import. Because `src/lib/auth.ts` calls `serverEnv()` at module load, `next build` fails without server env vars — this is intentional. Copy `.env.example` → `.env.local`.

**Database** — `src/db/index.ts` exports `db` (Drizzle on the Neon HTTP driver, `casing: "snake_case"`) and imports `server-only`. All table definitions live centrally in `src/db/schema/`, one file per domain, re-exported from `src/db/schema/index.ts` (drizzle-kit and the `db` client both read that barrel). Migrations output to `./drizzle` (use `db:generate` + `db:migrate`, not `push`). `drizzle.config.ts` must keep `casing: "snake_case"` to match the client. Scripts outside Next (e.g. `scripts/seed-catalog.ts`) build their own client, because `server-only` can't load there.

**Auth (Better Auth)** — the config is split in three so the `server-only` guard can stay on the db client:
- `src/lib/auth.options.ts` — shared options. **Add auth methods and plugins here**, never in `auth.ts`, or `auth:generate` won't create their tables. `nextCookies()` must stay the last plugin.
- `src/lib/auth.ts` — the real instance (`server-only`, real `db`, secret/baseURL from env). Exported `auth` and `Session` type.
- `src/lib/auth.cli.ts` — used only by `auth:generate` (placeholder db). The Better Auth CLI refuses any config that imports `server-only`, even transitively. Never import it from app code.
- `src/lib/auth-client.ts` — browser client (`better-auth/react`); `src/app/api/auth/[...all]/route.ts` mounts the handler.

`src/db/schema/auth.ts` is generated by `auth:generate` (re-exported from the schema barrel) — regenerate it after adding auth methods/plugins, then `db:generate` + `db:migrate`; don't hand-edit it.

**Better Auth Infra dashboard** — `dash()` from `@better-auth/infra` is in `auth.options.ts` (before `nextCookies()`); it reads `BETTER_AUTH_API_KEY` from the env itself. The dashboard connects by calling `<Base URL>/api/auth/dash/*` from Better Auth's servers, so it can't reach `localhost`: locally, run ngrok on the dev server's port (`ngrok http --url=<static-domain> 3000`) and use that URL with the custom header `ngrok-skip-browser-warning: true`. Without the dashboard's signed token those endpoints answer 401 — that's expected.

**Data fetching** — TanStack Query: `src/lib/query-client.ts` returns a fresh `QueryClient` per request on the server and a singleton in the browser (60s `staleTime`; pending queries are dehydrated so RSC prefetches can stream). `src/components/providers.tsx` wraps the root layout with the provider + devtools.

**UI** — shadcn/ui with the `base-nova` style on **Base UI** (`@base-ui/react`), lucide icons, Tailwind v4 (CSS-first config in `src/app/globals.css`, no `tailwind.config`).

**Design system** (all tokens in `src/app/globals.css`) — monochrome, imagery-first, square corners (`--radius: 0`), 1px hairlines, one sans family (Geist).
- Type roles: `text-display` / `text-headline` / `text-title` (fluid), `text-body` (14px default), `text-caption` (13px, product name/price), `eyebrow` (11px uppercase tracked: nav, buttons, kickers). Hierarchy via size/case/tracking, not bold weights.
- Colours: use semantic tokens only — `background`/`foreground`, `surface` (image wells, light bands), `inverse` (black bands/footer), `muted-foreground`, `border` (hairline) vs `border-strong`, `sale` (reduced prices only). No brand hue.
- Spacing/containers: `px-gutter`, `py-section`, `gap-block`, `gap-tile`, `h-header`; `max-w-page|content|prose`, utilities `container-page` / `container-content`.
- Links: `link` (underlined) and `link-quiet` (underline on hover); bare `<a>` is unstyled.
- Primitives in `src/components/primitives/`: `Section` (full-width band, `tone`), `Container`, `Stack`/`Cluster`, `Grid` (`products` 2→3→4 cols, `editorial`, `cards`, `columns`), `Media` (fixed-ratio image frame), `TextLink`.
- Buttons (`src/components/ui/button.tsx`): uppercase, square, `h-12` default; `inverse` (solid light) and `overlay` (transparent control) variants for use over imagery. Over photos use `text-on-image` and `scrim` gradients, not raw white/black.
- Motion: `ease-out-strong` for entrances, `ease-in-out-strong` for on-screen transitions, `animate-progress` (set `animation-duration` inline) for timed indicators. Animate transform/opacity/clip-path only; respect `prefers-reduced-motion`. The homepage hero (`src/components/home/hero-carousel.tsx`) is the reference: clip-path wipe via WAAPI, progress bar as the autoplay timer, pause on hover/focus/hidden tab/reduced motion.

**Storefront** — `src/app/layout.tsx` renders `SiteHeader` / `SiteFooter` (`src/components/site/`) around every page; the homepage composes sections from `src/components/home/`. Store name, nav and footer links live in `src/lib/site.ts` (the name is a placeholder). Collection listings live at `/collections/[collection]` and `/collections/[collection]/[category]` (`src/app/collections/`, rendered by `CollectionListing`).
- `resolveCollection()` in `src/lib/catalog/collections.ts` maps a slug to one of three listings:
  - `new`: the newest `NEW_ARRIVALS_PAGE_LIMIT` products;
  - `women` / `men`: that audience plus unisex;
  - a category.
- New, Women and Men have category tabs. The slugs `new`, `women` and `men` are reserved, and a seed test fails if a category takes one.
- Unknown collections or categories 404. A known category with no products in that collection shows the empty state.
- All listings are built on `ProductListing` (`src/components/product/product-listing.tsx`: breadcrumb, heading, sticky `ListingTabs`, then its children). The heading and tabs are prerendered; the results depend on the URL, so they stream in under `<Suspense>` (partial prerendering).
- Results (`src/components/listing/`): `ResultsSection` (server) parses the URL with `loadResultsParams`, reads `getResults` and seeds the query cache; `ResultsView` (client) reads the same URL with nuqs `useQueryStates(resultsParsers)` and takes over with `useResults`, one TanStack query per `/api/products` URL (`resultsQueryKey`), keeping the previous results on screen (dimmed) while the next load. It renders `ListingToolbar` ("N items sorted by …", Filter and sort), `FilterChips` (one per active value, then Clear all), `FilterSheet`, the grid and `LoadMore` ("Showing X of Y"; replaces `?page`, so reload restores it). The sheet edits a draft (its "Show N items" total comes from the same endpoint) and applies it as one pushed history entry, so Back undoes it; closing it discards the draft. Chip removals push too. Options without results are left out unless selected (selected ones stay so they can be removed); colour swatches are data in `swatches.ts`. `e2e/a11y.spec.ts` runs axe on a listing and the open sheet (no serious or critical violations). URL state lives in `src/lib/catalog/search-params.ts`; lists repeat their key (`?colour=red&colour=black`).
- `collectionCopy` in `src/lib/content.ts` holds the titles and descriptions for New, Women and Men, and each category's description. Category titles come from the database.
- There's deliberately no `loading.tsx` under collections. An on-demand render inside a loading boundary streams a 200 before `notFound()`, so unknown paths would lose their 404.
- Help, account, bag and search routes don't exist yet, so Next's link prefetching logs 404s for them in the console.

**Catalogue** — products and categories live in Postgres (`src/db/schema/catalog.ts`, relations in `relations.ts`): `categories 1──< products`, with stock as a units column on `products` (no variants or warehouses), an `audience` enum (`women` | `men` | `unisex`), `colour_family` and `material` enums for filtering (`colour` stays the exact shade shown to shoppers; the enum values are fixed in the M2 plan), and images/details as ordered JSONB. A migration that adds a required column to existing rows is hand-edited: add the column nullable, backfill by slug, then set `NOT NULL` (exception: `0004`'s search columns get empty defaults that their trigger always overwrites). `src/db/migrations.test.ts` replays the migrations over pre-M2 rows to prove it (`src/test/migrations.ts`). The storefront reads products only through `src/lib/catalog/queries.ts` (`getProduct`; `getNewArrivals`, the newest 8 by `created_at`; `getCollectionProducts`; `getSpotlightProduct`; `getRelatedProducts`; …), which return the `Product` shape in `src/lib/catalog/types.ts`; components never import `@/db`. The spotlight slug is in `merchandising.ts`. Prices are integer cents (`formatPrice` in `src/lib/format.ts`). `stockStatus()` in `src/lib/catalog/stock.ts` derives in stock / "Only N left" (≤3) / sold out. Product pages (`src/app/products/[slug]/page.tsx`) and the homepage are prerendered from cached reads (see **Caching**), so stock shown can lag the database by up to 5 minutes; products added after a build render on first request, unknown slugs 404, and product pages emit schema.org Product JSON-LD. `npm run db:seed` loads `src/db/seed/catalog.ts` via `seedCatalog()` in `src/db/seed/index.ts` (first load only — after that the database is the source of truth; re-seeding resets those products). Tests reuse the same seed on an in-memory PGlite with the real migrations (`createTestDb()` in `src/test/db.ts`). The seed holds 48 products (the pre-M2 9 first, in their original order); `src/db/seed/catalog.test.ts` pins its shape (category and audience counts, stock states, colour and material spread, one photo per product), and other tests derive their expectations from the seed rather than hard-coding counts. Seed gallery views are Unsplash focal-point crops built by `gallery()` (pass `main` to move the full shot's focal point). When adding product photos, check them at full resolution for logos, labels and engraved hardware — several Unsplash fashion photos carry brand marks only visible when enlarged.

**Search and results (M3)** — migration `0004` adds `products.search` (English `tsvector`: name weight A; colour, colour family, material and category name B; description and detail values C) and `products.search_text` (lower-cased name, colour, colour family, material and category name, for typo matching), both kept current by triggers: `products_search_refresh` (before insert/update) and `categories_search_refresh` (a category rename re-saves its products). A generated column can't read the category's name. The schema gives both an empty default that the trigger always overwrites, so inserts never set them; `pg_trgm` is enabled, and PGlite needs it loaded (`createPGlite()` in `src/test/pglite.ts`).
- `buildSearchQuery(q)` (`src/lib/catalog/search.ts`) keeps only runs of letters and digits (capped at 100 characters), ANDs them, and matches the last word as a prefix. Fixed vocabularies (audiences, colour families, materials) live in `src/lib/catalog/vocabulary.ts`; the database enums are built from them, so client code can validate values without Drizzle.
- `src/lib/catalog/filters.ts` holds the request model (`ResultsQuery`, `Filters`, `Sort`, `PRICE_BANDS`) and its rules: `hiddenFacets` (a page doesn't offer filters it fixes; category is only offered on search), `sortsFor`/`defaultSort` (relevance only on search) and `normaliseQuery` (drops values outside each vocabulary, rebuilds the scope from its own fields, reduces search text to its words, keeps a tab only on New/Women/Men, clamps the page to 1…`MAX_PAGE` (100), and sorts and deduplicates, so equal requests share a cache entry and no URL value reaches SQL unchecked).
- `getResults(query)` (`src/lib/catalog/results.ts`) normalises, then a cached read (`"use cache"`, `catalog` tag and lifetime) returns the first `page × 24` products, the total, and counts per filter option. Two queries run in parallel: products with `count(*) over ()`, and one `UNION ALL` of grouped counts where each facet applies every filter except its own. A product matches a search when **every word** matches, by full text (the last word as a prefix) or, for words of 4+ letters, by a near spelling (`word_similarity(word, search_text) >= TYPO_THRESHOLD`, 0.45; pg_trgm's 0.6 default misses "lether"). Stop words don't constrain the match, but a stop-words-only query matches nothing. Relevance ranks by `ts_rank_cd`, then similarity, then newest. The explicit threshold means the trigram index isn't used (the indexable `<%` operator reads a session setting the Neon HTTP driver can't keep); fine at this catalogue's size.
- `GET /api/products` (`src/app/api/products/route.ts`) serves `getResults` to the client: `?collection=…` (plus `?tab=…` on New, Women and Men) or `?q=…`, then the same URL keys as the pages. Unknown collections or tabs return 404 JSON; any other bad value is dropped by the parsers. It sends `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` and `Server-Timing: db;dur=…`. `resultsApiPath(query)` builds its URL with keys in a fixed order and defaults left out, so equal queries share a URL.

**Caching (Cache Components)** — `next.config.ts` sets `cacheComponents: true`. Every read in `src/lib/catalog/queries.ts` starts with `"use cache"` and calls `cacheTag("catalog")` and `cacheLife("catalog")`, a profile defined in `next.config.ts` (`stale`/`revalidate` 300 s, `expire` one year, matching Next's default). It's stale-while-revalidate: after 5 minutes the next visit still gets the cached copy while a fresh one renders, so an edit shows from the visit after that. For an immediate refresh, M6's admin should call `updateTag("catalog")` in a Server Action (or `revalidateTag("catalog", { expire: 0 })` in a Route Handler; the one-argument `revalidateTag` is deprecated). `src/lib/catalog/queries-cache.test.ts` checks every exported read keeps its three cache lines. `revalidate` and `dynamicParams` are gone (the build rejects `dynamicParams`); the only route segment config is `export const instant = false` on the four pages with dynamic params (products, collections, collection tabs, stories), so params outside `generateStaticParams` render blocking and `notFound()` still returns a real 404 — streaming would send a 200 first, as `loading.tsx` did in M2. Reading the clock during prerender fails the build: put it in a `"use cache"` function/component (the footer's `CopyrightYear`), or under `<Suspense>` after `await connection()`. Request data (`cookies()`, `headers()`, `searchParams`) goes under `<Suspense>`. In Vitest, `next/cache` is aliased to `src/test/next-cache.ts` (no-ops), so cached reads run uncached against PGlite. Client navigation keeps the previous route mounted but hidden (React `<Activity>`), so e2e locators that count elements after a client-side navigation use `:visible`.

**Editorial content** — hero slides, featured collections and services live in code in `src/lib/content.ts`; they aren't catalogue data. Editorial pages (stories and the Women and Men landings) are typed content in `src/content/`, built from blocks (`types.ts`: hero, category tiles, product row, story split, text, image, quote).
- `EditorialBlocks` (`src/components/editorial/`) renders a page's blocks, fetching all their products in one `getProductsBySlugs()` query. A hero as the first block is the page's h1.
- `findContentProblems()` (`src/content/blocks.ts`) catches links that would 404, unknown products, images not on `images.unsplash.com` or without alt text, and products or category tiles on a Women/Men page that don't suit that audience. `src/content/content.test.ts` runs it against the seed catalogue, so content can't reference a product the seed lacks.
- Stories (`src/content/stories.ts`) render at `/stories` and `/stories/[slug]` (static, other slugs 404). `homepageStory` feeds the homepage story band.
- `/women` and `/men` (`src/content/landings.ts`) are the primary nav's Women and Men destinations and the homepage hero's links: hero (from `heroSlides`), a category tile per category the audience can shop (opening `/collections/<audience>/<category>`), "The edit" (8 products), a story split, then "Shop all". Their listings stay at `/collections/women` and `/collections/men`.
- Product rows hide the cards that would start an incomplete last row at the current column count; category tiles are a swipeable strip on phones and one row from md up.

**Bag & saved items** — no cart backend yet: `src/lib/bag/store.ts` is a browser-only store (`useBag()`, `bagActions.add/toggleSaved`) persisted to `localStorage` (`orra:bag:v1`), synced across tabs, empty on the server. Pure rules (quantity capped at stock, save toggle, parsing stored data) live in `src/lib/bag/rules.ts`; move them server-side when the cart gets an API. The product page's `PurchaseActions` (Add to bag, Save for later, delivery estimate from `src/lib/catalog/delivery.ts`, sticky bar) and the header `BagLink` count read from it.

**Images** — `next.config.ts` uses a custom loader (`src/lib/image-loader.ts`): `images.unsplash.com` URLs are resized by Unsplash's CDN (width/quality/`auto=format` params), everything else goes through Next's optimiser. Store bare Unsplash URLs (`https://images.unsplash.com/photo-<id>`) with no size params. Next's optimiser has a hard 7s upstream timeout, which large remote originals hit under concurrent load — keep that in mind before routing a new image host through it.

**`cn`** — `src/lib/utils.ts` builds `cn` with `createCn` and registers the custom `text-*`, spacing and container names; otherwise class merging drops e.g. `text-caption` next to a text colour. tsconfig aliases the bare `"cn"` import to that file, so shadcn components (which `import { cn } from "cn"`) get it too. When adding a theme token in `globals.css`, add it to `utils.ts` as well.

## Gotchas

- drizzle-kit loads `.env` on startup, before `drizzle.config.ts`, and dotenv never overrides a value that's already set. Run bare, it ignores `.env.local` and targets production. That's why its npm scripts set `DOTENV_CONFIG_PATH=.env.local` and `db:migrate` runs through `scripts/migrate.ts`; `scripts/package-scripts.test.ts` pins this. Always use the npm scripts, never `npx drizzle-kit`.

- `scripts/fix-intent-bin.mjs` (root `postinstall`) re-points `node_modules/.bin/intent` at `@tanstack/intent`: TanStack Form's `@tanstack/devtools-event-client` ships a broken `intent` bin that npm links over it. If `npx intent` crashes with `ERR_PACKAGE_PATH_NOT_EXPORTED … intent-library`, run `npm install`. Delete the script once that package fixes its bin.
- npm 11 blocks dependency install scripts by default; warnings about `esbuild`/`unrs-resolver` postinstalls during `npm install` are expected.
- `@vitejs/plugin-react` currently fails to install (its optional Babel 8 peers conflict with shadcn's Babel 7); Vitest doesn't need it.
