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
- Buttons (`src/components/ui/button.tsx`): uppercase, square, `h-12` default; variants include `inverse` for use over imagery.

**`cn`** — `src/lib/utils.ts` builds `cn` with `createCn` and registers the custom `text-*`, spacing and container names; otherwise class merging drops e.g. `text-caption` next to a text colour. tsconfig aliases the bare `"cn"` import to that file, so shadcn components (which `import { cn } from "cn"`) get it too. When adding a theme token in `globals.css`, add it to `utils.ts` as well.

## Gotchas

- `scripts/fix-intent-bin.mjs` (root `postinstall`) re-points `node_modules/.bin/intent` at `@tanstack/intent`: TanStack Form's `@tanstack/devtools-event-client` ships a broken `intent` bin that npm links over it. If `npx intent` crashes with `ERR_PACKAGE_PATH_NOT_EXPORTED … intent-library`, run `npm install`. Delete the script once that package fixes its bin.
- npm 11 blocks dependency install scripts by default; warnings about `esbuild`/`unrs-resolver` postinstalls during `npm install` are expected.
- `@vitejs/plugin-react` currently fails to install (its optional Babel 8 peers conflict with shadcn's Babel 7). If adding Vitest, it isn't needed — Vite 8 compiles JSX natively.
