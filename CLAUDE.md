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
npm run db:generate      # drizzle-kit migration from schema
npm run db:migrate | db:push | db:studio
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
- Local development uses the Neon `dev` branch. `.env.local` sets `DATABASE_URL` to it, and Next, drizzle-kit and the seed script read `.env.local` before `.env`. `.env` keeps production's URL plus `PRODUCTION_DB_HOST`, which `db:seed` checks (`scripts/db-target.ts`). Before any local `db:migrate`, run `npm run db:seed -- --check`; it must print `not production`. Worktrees symlink both files; never read them.

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

**Storefront** — `src/app/layout.tsx` renders `SiteHeader` / `SiteFooter` (`src/components/site/`) around every page; the homepage composes sections from `src/components/home/`. Store name, nav and footer links live in `src/lib/site.ts` (the name is a placeholder). `/collections/new` (New arrivals: newest `NEW_ARRIVALS_PAGE_LIMIT` products, with per-category tabs at `/collections/new/[category]`) is built on the shared `ProductListing` (`src/components/product/product-listing.tsx`: breadcrumb, heading, sticky `ListingTabs`, count, product grid) — reuse it for future collection pages. Other collection, help, account and bag routes don't exist yet, so Next's link prefetching logs 404s for them in the console.

**Catalogue** — products and categories live in Postgres (`src/db/schema/catalog.ts`, relations in `relations.ts`): `categories 1──< products`, with stock as a units column on `products` (no variants or warehouses), and images/details as ordered JSONB. The storefront reads them only through `src/lib/catalog/queries.ts` (`getProduct` — React-`cache`d, `getNewArrivals` = newest 8 by `created_at`, `getSpotlightProduct`, `getRelatedProducts`, …), which return the `Product` shape in `src/lib/catalog/types.ts`; components never import `@/db`. The spotlight slug is in `merchandising.ts`. Prices are integer cents (`formatPrice` in `src/lib/format.ts`). `stockStatus()` in `src/lib/catalog/stock.ts` derives in stock / "Only N left" (≤3) / sold out. Product pages (`src/app/products/[slug]/page.tsx`) and the homepage are prerendered and revalidate every 5 minutes (`revalidate = 300`), so stock shown can lag the database by that much; products added after a build render on first request, unknown slugs 404, and product pages emit schema.org Product JSON-LD. `npm run db:seed` loads `src/db/seed/catalog.ts` via `seedCatalog()` in `src/db/seed/index.ts` (first load only — after that the database is the source of truth; re-seeding resets those products). Tests reuse the same seed on an in-memory PGlite with the real migrations (`createTestDb()` in `src/test/db.ts`). Seed gallery views are Unsplash focal-point crops built by `gallery()`. When adding product photos, check them at full resolution for logos, labels and engraved hardware — several Unsplash fashion photos carry brand marks only visible when enlarged.

**Editorial content** — hero slides, featured collections, the story band and services live in code in `src/lib/content.ts`; they aren't catalogue data.

**Bag & saved items** — no cart backend yet: `src/lib/bag/store.ts` is a browser-only store (`useBag()`, `bagActions.add/toggleSaved`) persisted to `localStorage` (`orra:bag:v1`), synced across tabs, empty on the server. Pure rules (quantity capped at stock, save toggle, parsing stored data) live in `src/lib/bag/rules.ts`; move them server-side when the cart gets an API. The product page's `PurchaseActions` (Add to bag, Save for later, delivery estimate from `src/lib/catalog/delivery.ts`, sticky bar) and the header `BagLink` count read from it.

**Images** — `next.config.ts` uses a custom loader (`src/lib/image-loader.ts`): `images.unsplash.com` URLs are resized by Unsplash's CDN (width/quality/`auto=format` params), everything else goes through Next's optimiser. Store bare Unsplash URLs (`https://images.unsplash.com/photo-<id>`) with no size params. Next's optimiser has a hard 7s upstream timeout, which large remote originals hit under concurrent load — keep that in mind before routing a new image host through it.

**`cn`** — `src/lib/utils.ts` builds `cn` with `createCn` and registers the custom `text-*`, spacing and container names; otherwise class merging drops e.g. `text-caption` next to a text colour. tsconfig aliases the bare `"cn"` import to that file, so shadcn components (which `import { cn } from "cn"`) get it too. When adding a theme token in `globals.css`, add it to `utils.ts` as well.

## Gotchas

- `scripts/fix-intent-bin.mjs` (root `postinstall`) re-points `node_modules/.bin/intent` at `@tanstack/intent`: TanStack Form's `@tanstack/devtools-event-client` ships a broken `intent` bin that npm links over it. If `npx intent` crashes with `ERR_PACKAGE_PATH_NOT_EXPORTED … intent-library`, run `npm install`. Delete the script once that package fixes its bin.
- npm 11 blocks dependency install scripts by default; warnings about `esbuild`/`unrs-resolver` postinstalls during `npm install` are expected.
- `@vitejs/plugin-react` currently fails to install (its optional Babel 8 peers conflict with shadcn's Babel 7); Vitest doesn't need it.
