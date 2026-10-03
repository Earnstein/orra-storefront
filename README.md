# Shopify

Next.js 16 (App Router) e-commerce app — project scaffold only.

## Stack

| Concern  | Tool |
| -------- | ---- |
| Framework | Next.js 16, React 19, TypeScript |
| Styling / UI | Tailwind CSS v4, shadcn/ui (`base-nova`, lucide icons) |
| Auth | Better Auth (Drizzle adapter, `nextCookies` plugin) |
| Database | Drizzle ORM + Neon Postgres (`neon-http` driver) |
| Data / UI state | TanStack Query, TanStack Table v9, TanStack Form |
| AI agent skills | TanStack Intent (`AGENTS.md` / `CLAUDE.md`), shadcn skill (`.claude/skills/shadcn`) |
| Validation | Zod |

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, BETTER_AUTH_SECRET, ...
npm run dev
```

## Scripts

| Script | Purpose |
| ------ | ------- |
| `dev` / `build` / `start` | Next.js |
| `lint` / `typecheck` | ESLint (incl. TanStack Query rules) / `tsc` |
| `db:generate` / `db:migrate` / `db:push` / `db:studio` | drizzle-kit |
| `auth:generate` | Generate Better Auth tables into `src/db/schema/auth.ts` |
| `skills:update` | Update skills installed via the `skills` CLI (shadcn) |

## Layout

```
src/
  app/
    api/auth/[...all]/route.ts   Better Auth handler
    layout.tsx                   Root layout + Providers
  components/
    providers.tsx                QueryClientProvider + devtools
    ui/                          shadcn components (`npx shadcn@latest add <name>`)
  db/
    index.ts                     Drizzle client (server-only)
    schema/index.ts              Schema barrel
  lib/
    auth.ts / auth-client.ts     Better Auth server (server-only) / React client
    auth.options.ts              Shared Better Auth options — add methods/plugins here
    auth.cli.ts                  CLI-only config for `auth:generate` (placeholder db)
    env.ts                       Zod-validated env
    query-client.ts              QueryClient factory
    utils.ts                     cn()
drizzle.config.ts
```

## Notes

- The build requires the server env vars (`DATABASE_URL`, `BETTER_AUTH_*`) — they are validated when the auth route is loaded.
- Forms use **TanStack Form**, not react-hook-form. Skip shadcn's `form` component (it depends on react-hook-form); use the field primitives with TanStack Form instead.
- AI skills from TanStack packages: `npx intent list` / `npx intent load <pkg>#<skill>`. A `postinstall` script (`scripts/fix-intent-bin.mjs`) works around a broken `intent` bin shipped by a TanStack Form dependency.
