# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project state

Next.js 16 (App Router, `src/`, `@/*` → `src/*`) e-commerce app. Currently a **scaffold only**: integrations are wired, but there are no database tables, auth methods, feature UI or tests yet. Package manager is **npm**.

## Commands

```bash
npm run dev              # Next dev server (Turbopack)
npm run build            # production build — needs DATABASE_URL + BETTER_AUTH_* set (see below)
npm run lint             # ESLint (next + TanStack Query rules)
npm run typecheck        # next typegen && tsc --noEmit (typegen is required for LayoutProps/PageProps)

npm run auth:generate    # Better Auth tables → src/db/schema/auth.ts
npm run db:generate      # drizzle-kit migration from schema
npm run db:migrate | db:push | db:studio

npx intent list                              # TanStack agent skills
npx intent load <package>#<skill>
npm run skills:update                        # update the shadcn skill (skills CLI)
npx shadcn@latest add <component>
```

There is no test runner configured yet.

## Architecture

**Env** — `src/lib/env.ts` validates with Zod. `serverEnv()` is a function that parses on call (throws if invalid); `clientEnv` holds `NEXT_PUBLIC_*` and is parsed at import. Because `src/lib/auth.ts` calls `serverEnv()` at module load, `next build` fails without server env vars — this is intentional. Copy `.env.example` → `.env.local`.

**Database** — `src/db/index.ts` exports `db` (Drizzle on the Neon HTTP driver, `casing: "snake_case"`) and imports `server-only`. All table definitions live centrally in `src/db/schema/`, one file per domain, re-exported from `src/db/schema/index.ts` (drizzle-kit and the `db` client both read that barrel). Migrations output to `./drizzle`.

**Auth (Better Auth)** — the config is split in three so the `server-only` guard can stay on the db client:
- `src/lib/auth.options.ts` — shared options. **Add auth methods and plugins here**, never in `auth.ts`, or `auth:generate` won't create their tables. `nextCookies()` must stay the last plugin.
- `src/lib/auth.ts` — the real instance (`server-only`, real `db`, secret/baseURL from env). Exported `auth` and `Session` type.
- `src/lib/auth.cli.ts` — used only by `auth:generate` (placeholder db). The Better Auth CLI refuses any config that imports `server-only`, even transitively. Never import it from app code.
- `src/lib/auth-client.ts` — browser client (`better-auth/react`); `src/app/api/auth/[...all]/route.ts` mounts the handler.

After `auth:generate`, add `export * from "./auth";` to `src/db/schema/index.ts`, then `db:push`/`db:generate`.

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

**Storefront** — `src/app/layout.tsx` renders `SiteHeader` / `SiteFooter` (`src/components/site/`) around every page; the homepage composes sections from `src/components/home/`. Store name, nav and footer links live in `src/lib/site.ts` (the name is a placeholder). Collection, help, account and bag routes don't exist yet, so Next's link prefetching logs 404s for them in the console.

**Catalogue** — until products are in the database, data lives in `src/lib/catalog/sample-data.ts` and is read only through `src/lib/catalog/queries.ts` (`getProduct`, `getNewArrivals`, `getRelatedProducts`, …); swap those bodies for DB queries later. Prices are integer cents (`formatPrice` in `src/lib/format.ts`). Stock is stored as units; `stockStatus()` in `src/lib/catalog/stock.ts` derives in stock / "Only N left" (≤3) / sold out. Product pages (`src/app/products/[slug]/page.tsx`) are statically generated, unknown slugs 404, and emit schema.org Product JSON-LD. Each sample product has one photo; extra gallery views are Unsplash focal-point crops built by `gallery()`. When adding product photos, check them at full resolution for logos, labels and engraved hardware — several Unsplash fashion photos carry brand marks only visible when enlarged.

**Bag & saved items** — no cart backend yet: `src/lib/bag/store.ts` is a browser-only store (`useBag()`, `bagActions.add/toggleSaved`) persisted to `localStorage` (`orra:bag:v1`), synced across tabs, empty on the server. Pure rules (quantity capped at stock, save toggle, parsing stored data) live in `src/lib/bag/rules.ts`; move them server-side when the cart gets an API. The product page's `PurchaseActions` (Add to bag, Save for later, delivery estimate from `src/lib/catalog/delivery.ts`, sticky bar) and the header `BagLink` count read from it.

**Images** — `next.config.ts` uses a custom loader (`src/lib/image-loader.ts`): `images.unsplash.com` URLs are resized by Unsplash's CDN (width/quality/`auto=format` params), everything else goes through Next's optimiser. Store bare Unsplash URLs (`https://images.unsplash.com/photo-<id>`) with no size params. Next's optimiser has a hard 7s upstream timeout, which large remote originals hit under concurrent load — keep that in mind before routing a new image host through it.

**`cn`** — `src/lib/utils.ts` builds `cn` with `createCn` and registers the custom `text-*`, spacing and container names; otherwise class merging drops e.g. `text-caption` next to a text colour. tsconfig aliases the bare `"cn"` import to that file, so shadcn components (which `import { cn } from "cn"`) get it too. When adding a theme token in `globals.css`, add it to `utils.ts` as well.

## Gotchas

- `scripts/fix-intent-bin.mjs` (root `postinstall`) re-points `node_modules/.bin/intent` at `@tanstack/intent`: TanStack Form's `@tanstack/devtools-event-client` ships a broken `intent` bin that npm links over it. If `npx intent` crashes with `ERR_PACKAGE_PATH_NOT_EXPORTED … intent-library`, run `npm install`. Delete the script once that package fixes its bin.
- npm 11 blocks dependency install scripts by default; warnings about `esbuild`/`unrs-resolver` postinstalls during `npm install` are expected.
- `@vitejs/plugin-react` currently fails to install (its optional Babel 8 peers conflict with shadcn's Babel 7). If adding Vitest, it isn't needed — Vite 8 compiles JSX natively.
