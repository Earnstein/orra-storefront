# Orra: roadmap to live (design)

- **Date:** 2026-10-04
- **Status:** approved 2026-10-04. Amended 2026-10-04 while brainstorming M2 (see the [M2 spec](2026-10-04-m2-browse-design.md)):
  - "Browse & find" is split into **M2 Browse** and **M3 Find**, and the later milestones move up one.
  - M2 gains editorial landing pages and stories.
  - Products gain an audience, a colour family and a material.
  - M3's client tools are decided: nuqs, TanStack Query and TanStack Pacer.
- **Scope of this spec:** the milestones from today's baseline to a public `v1.0.0`, and the delivery process every module follows. Each milestone gets its own spec and plan (see [Specs and plans per milestone](#specs-and-plans-per-milestone)); this document fixes their scope, order and exit criteria, and the cross-cutting decisions they share.

## Intent

**What the user asked for:** build the remaining storefront as features or modules on branches. Each branch is reviewed, tested and approved, then recorded as a milestone, until everything here is done and the product goes live.

**Decisions made while brainstorming:**

| Question | Decision |
|---|---|
| What "live" means | Publicly deployed live demo / portfolio. Fully working, payments in Stripe **test mode** only (no real money). |
| Journeys required for live | Browse & find, Bag & checkout, Accounts, Store admin (all four). |
| Review and approval | GitHub pull requests + CI + Vercel preview per PR; the user approves by merging. |
| Admin on the public demo | Visitors can try it via a one-click demo login. Demo data resets automatically. The owner's admin account is separate. |
| Order of work | Foundations first, then journeys in shopper order (approach A). |

**Assumptions (not stated by the user):** Gucci stays the design reference (adapt patterns, never copy text, assets or branding). Neon Postgres, Drizzle and Better Auth stay. The design system in `src/app/globals.css` and the primitives in `src/components/primitives/` are the only styling vocabulary.

**Supersedes:** the first catalogue plan's "no carts, orders, payments, wishlist" limit. Those were out of scope for the catalogue migration only; this roadmap brings carts, orders, payments and saved items in.

## Success criteria for `v1.0.0`

1. On the production URL, a visitor can:
   - follow every nav link to a working page (a listing or an editorial landing page) and read the stories;
   - filter, sort and page through listings, and search with results that appear as they type;
   - sign up and sign in, and save items;
   - add to bag and pay with a Stripe test card;
   - see the order confirmation, receive the email and see the order in their account;
   - open the admin via "Try the admin" and edit a product.
2. Stock never goes below zero and a unit is never sold twice, including under concurrent checkouts.
3. Every internal link resolves (no 404s from the header, footer or pages).
4. CI (lint, typecheck, unit, end-to-end, build) and the launch checks (accessibility, performance budgets) pass on `main`.
5. `docs/milestones.md` lists `v0.1.0` → `v1.0.0`, each with its tag, GitHub Release and pull requests.

**Out of scope for `v1.0.0`:** live payments, real fulfilment or shipping integrations, taxes, multi-currency, product variants (sizes and colours as separate SKUs), reviews, gift cards, store locator data, marketing emails. A milestone may not add these without a spec change.

## Delivery process

Every module follows this process, from M1 on.

**Units.**
- A **milestone** is a group of modules and a **GitHub Milestone** that collects its pull requests.
- A **module** is one branch (`feat/<module>`, or `fix/…` / `docs/…` / `chore/…`) and one pull request.

**A pull request is done when:**
1. CI is green: `npm run lint`, `npm run typecheck`, unit tests (Vitest), end-to-end tests (Playwright) and `npm run build`.
2. The implementer has checked it in the browser at 375, 1024, 1280 and 1440 px wide:
   - spacing measured against the design tokens (`gutter`, `section`, `block`, `tile`, `header`);
   - no console errors from the site.
3. The description says what and why, how it was tested, and has screenshots (desktop and mobile) and the Vercel preview link. A pull request template enforces the headings.
4. The user has reviewed the preview. **Approval = the user merges**, by squash merge, so each module is one commit on `main`. The implementer opens and updates pull requests but never merges them.

**Environments.**
- **Preview:** every pull request gets a Vercel preview with its own Neon database branch, created by the Neon–Vercel integration and migrated and seeded on deploy. Previews never touch production data.
- **Production:** `main` deploys to production.
- **Secrets:** only in Vercel and GitHub settings and the developer's local `.env`/`.env.local`, never in the repo. `.env.example` lists every variable with an empty or placeholder value.

**Recording a milestone.** When a milestone's last pull request is merged:
1. Tag `main` (annotated, `vX.Y.0`).
2. Publish a GitHub Release with notes and links to the milestone's pull requests.
3. Append an entry to `docs/milestones.md`: version, date, scope, pull requests, URL.

Pushes and tags go through the user's approval (`.claude/settings.json` asks before every `git push`).

**Versions.** Today's `main` is the baseline `v0.1.0`, tagged in M1. Each milestone bumps the minor version, and go-live is `v1.0.0`.

### Specs and plans per milestone

Before a milestone's first module starts:
1. Write its spec in `docs/superpowers/specs/YYYY-MM-DD-<milestone>-design.md`.
2. Write its plan in `docs/superpowers/plans/YYYY-MM-DD-<milestone>.md`.

Each goes through the brainstorming → writing-plans gates, and the user approves both before code is written. **Exception: M1 is fully specified by this document**, so its plan argues directly from this spec. The plan's tasks map 1:1 (or many:1) onto that milestone's module pull requests. A milestone spec may refine this roadmap's details; it may not change a milestone's exit criteria or move scope between milestones without updating this document.

## Milestones

### `v0.1.0`: Baseline (done)

Homepage with hero carousel. Product detail pages with gallery, Add to bag and Save for later (browser-only). New arrivals at `/collections/new` with category tabs. Catalogue (products, categories, stock) in Neon via Drizzle. Better Auth with email and password and the Infra `dash()` plugin; auth tables migrated. Tagged during M1.

### M1: Delivery pipeline → `v0.2.0`

| Module | Delivers |
|---|---|
| Repo on GitHub | Remote added, `main` and the existing tags pushed, branch protection on `main` (PR + green CI required). |
| Unit tests | Vitest configured (no `@vitejs/plugin-react`; see CLAUDE.md gotchas). Tests for `lib/bag/rules.ts`, `lib/catalog/stock.ts`, `lib/catalog/delivery.ts`, and the catalogue queries against PGlite with the real migrations applied and the seed loaded. |
| End-to-end tests | Playwright smoke: homepage renders the new arrivals, a product page shows price and stock, `/collections/new` and a category tab work, an unknown slug 404s; desktop and mobile viewports. |
| CI | GitHub Actions on every PR and on `main`: install, lint, typecheck, unit, build, end-to-end against the built app. |
| Previews | Vercel project linked. The Neon integration gives each preview its own database branch; migrations and seed run for previews. Production env vars set. |
| Process docs | PR template, `docs/milestones.md` (with the `v0.1.0` entry), a short "How we ship" section in `CLAUDE.md`. |

**Exit:** a pull request shows green CI and a working preview URL with its own database branch.

### M2: Browse → `v0.3.0`

| Module | Delivers |
|---|---|
| Error pages | Styled `not-found.tsx` and `error.tsx` for the storefront. |
| Collection pages | `/collections/[slug]` for each category and for `women` / `men` (audience, including unisex), with category tabs on New, Women and Men, built on `ProductListing`. A women/men/unisex audience field on `products` (migration with backfill, seed). Homepage links into listings resolve. |
| Catalogue expansion | 48 products across the five categories. Photos are free Unsplash shots, plain backgrounds first, each checked at full resolution for logos and brand marks and approved on a contact sheet. `colour_family` and `material` on `products` (migration with backfill, seed), ready for M3's filters. A guard stops `db:seed` touching production unless `--production` is passed. After this module merges, the seed runs once against production (production builds never seed). |
| Editorial pages | `/women` and `/men` landing pages: campaign photo, category tiles, a hand-picked product row, a story block, Shop all. Stories: `/stories`, `/stories/knitwear` and a second story, each with a "Shop the story" row. Content is typed blocks in `src/content/`. The primary nav's Women and Men link to the landing pages. |

**Exit:**
- every primary-nav link leads to a working page (a listing or a landing page);
- every link on the homepage resolves;
- the 48 products are live in production.

### M3: Find → `v0.4.0`

| Module | Delivers |
|---|---|
| Results endpoint and URL state | A cached GET endpoint that returns listing and search results from the database: products, plus counts for each filter option. State lives in the URL via nuqs, whose parsers are shared by server components, the endpoint and client hooks. TanStack Query fetches and caches: previous results stay on screen while new ones load, and stale requests are cancelled. The first page is rendered on the server. |
| Filter and sort | Filters: category, audience, colour, material, price, in stock and new in, with a count on each option. Sort: newest, price low→high, price high→low. Shareable and back-button safe, on every listing including `/collections/new`. |
| Pagination | On every listing and on search results, with the page in the URL. |
| Live search | Postgres full-text search over name, description, colour, material and category, using a `tsvector` that a trigger keeps current, with a GIN index. Typo tolerance via `pg_trgm`. A header search panel shows results as the shopper types (debounced with TanStack Pacer's `useDebouncedValue`). The `/search?q=` results page has filters and pagination, plus empty and no-results states. |

**Exit:**
- filters, sort and pagination work on every listing through the URL;
- live search finds products by name, colour and category, including with typos.

### M4: Accounts → `v0.5.0`

| Module | Delivers |
|---|---|
| Sign up / sign in / sign out | Pages built with TanStack Form + shadcn `Field`. Errors shown inline. Redirect back to where the user came from. |
| Password reset | Request and reset pages; email via Resend (see [Open items](#open-items-settled-in-the-named-milestones-spec)). |
| Account page | Profile (name, email) and links to saved items and, after M5, orders. Protected route. |
| Saved items | `saved_items` table. Server actions to save or unsave. On sign-in, items saved in the browser (`orra:bag:v1` → `saved`) merge into the account. The header and product pages read the account's list when signed in. |

**Exit:** a signed-in user's saved items appear on another device; signed-out behaviour is unchanged.

### M5: Bag & checkout → `v0.6.0`

| Module | Delivers |
|---|---|
| Server-side bag | `carts` and `cart_items`. Guests are identified by a signed, httpOnly cookie; on sign-in the guest cart merges into the user's. Quantities are capped at stock (the rule in `lib/bag/rules.ts` moves server-side). The header count reads the server bag. |
| Bag page | `/bag`: lines, quantity changes, remove, subtotal, complimentary delivery note, empty state. |
| Checkout | Stock re-checked, then a Stripe Checkout Session (hosted, test mode) is created. A demo banner shows the Stripe test card. |
| Orders | `orders` and `order_items` (name and price copied at purchase). A signed webhook at `/api/stripe/webhook` creates the order and decrements stock in one transaction. Duplicate events are ignored. |
| Confirmation | `/checkout/success` page and an order confirmation email. |
| Order history | Orders list and detail in the account. |

**Exit:** a test purchase reduces stock, appears in the user's order history and sends the email; concurrent purchases of the last unit result in one order and one automatic refund.

### M6: Store admin → `v0.7.0`

| Module | Delivers |
|---|---|
| Roles | Better Auth `admin` plugin, regenerated auth schema. Roles: `admin` (owner) and `demo-admin`. Every admin route and server action checks the role on the server. |
| Products | `/admin/products`: TanStack Table v9 list with search and sort. Create and edit with TanStack Form: fields, category, audience, colour family, material, price, stock, details, images uploaded to Vercel Blob with alt text. Edits refresh the affected storefront pages immediately. |
| Orders | `/admin/orders`: list, detail, status changes (paid → fulfilled, cancel). |
| Demo admin | A "Try the admin" button signs into the shared `demo-admin` account. It's rate-limited and can't manage users, roles or the owner account. |
| Demo reset | A nightly Vercel Cron job hits a secret-protected route. It restores the catalogue and stock to the seed, deletes products that aren't in the seed, and clears orders and carts older than the reset window. On the demo, the seed is the catalogue's source of truth: catalogue changes meant to last (including the owner's) go into the seed. Users, roles and the owner's account are never reset. |

**Exit:** a visitor edits a product through "Try the admin", sees the change on the storefront, and it is gone after the next reset; the owner's account and role are unaffected.

### M7: Launch → `v1.0.0`

| Module | Delivers |
|---|---|
| Production | Custom domain on Vercel, production database, environment variables. A verified Resend sending domain, so any visitor gets their emails. Better Auth Infra base URL moved off the ngrok tunnel to the production URL. |
| SEO | `sitemap.xml`, `robots.txt`, canonical URLs, Open Graph images for home, listings and products. |
| Quality gates | axe accessibility checks in Playwright on every page type. Performance budgets checked in CI (Lighthouse): LCP, CLS and JS size on home, listing and product pages. |
| Monitoring | Error monitoring and basic analytics. |
| Content | Short help pages (contact, delivery, returns) and legal pages (privacy, terms, cookies) written for a demo. Links with no page (stores, services) are built minimally or removed. |
| Case study | README and an `/about` case-study page describing the build, with screenshots. |

**Exit:** the success criteria above hold on production; `v1.0.0` is tagged and released.

## Architecture decisions shared by milestones

**Data.**
- All tables are defined in `src/db/schema/`, one file per domain (`catalog`, `saved`, `cart`, `orders`, plus the generated `auth`), and re-exported from the barrel.
- Migrations come only from `db:generate` + `db:migrate`.
- Money is integer cents with `site.currency`.
- Products are addressed by `slug` in URLs and by `id` in foreign keys.

| Milestone | New data |
|---|---|
| M2 | `products.audience` (`women` / `men` / `unisex`), `products.colour_family` and `products.material` (fixed lists, for M3's filters). |
| M3 | `products.search` (`tsvector` kept current by a trigger, GIN index) and a `pg_trgm` index for typo tolerance. |
| M4 | `saved_items(user_id, product_id, created_at)`, PK on both ids, cascading deletes. |
| M5 | `carts(id, user_id unique nullable, …)`, `cart_items(cart_id, product_id, quantity > 0)`, `orders(id, number, user_id nullable, email, status, subtotal, currency, stripe_session_id unique, created_at)`, `order_items(order_id, product_id, name, unit_price, quantity)`. |
| M6 | Better Auth admin fields (`role`, …) via `auth:generate`. |

**Reads and writes.**
- Pages are server components that read through `src/lib/**/queries.ts`; components never import `@/db`.
- Mutations are server actions, with Zod-validated input and server-side auth and role checks.
- Through M2, pages were ISR (`revalidate = 300`). From M3, the app uses Next 16's Cache Components: catalogue reads are `"use cache"` functions tagged `catalog` with a 5-minute lifetime, and pages have no route segment configs ([M3 spec](2026-10-05-m3-find-design.md)).
- From M3, listings and search load their results from a GET endpoint backed by the same cached reads, and the first page is rendered on the server.
- Writes call `revalidatePath` / `revalidateTag` so changes show immediately.

**Client data tools.**

| Tool | Used for |
|---|---|
| nuqs | URL state for listings and search (M3). |
| TanStack Query | Fetching and caching on the client: listings and search in M3, admin tables in M6. |
| TanStack Pacer | Debouncing the search text (`useDebouncedValue`) in M3. It's beta, so the version is pinned and its use kept narrow. |

TanStack DB was evaluated for search during M2's brainstorming. Its live queries run in the browser and have no full-text search or relevance ranking, so it isn't used there. Revisit it for the bag and saved items (M4, M5) and the admin tables (M6), where its optimistic mutations fit.

**Transactions.** The webhook and stock decrement need a transaction whose later statements depend on earlier results. The neon-http driver can't do that, so this path uses Neon's WebSocket driver (`drizzle-orm/neon-serverless` with a `Pool`). The decrement is `UPDATE … SET stock = stock - $q WHERE id = $id AND stock >= $q`; zero rows updated means out of stock, so the order is cancelled and refunded.

**Integrations.** All keys are env vars, validated in `src/lib/env.ts`, with placeholders in `.env.example`.

| Integration | Use |
|---|---|
| Stripe (test mode) | Checkout Sessions, refunds, signed webhooks. |
| Resend | Password reset and order confirmation emails. |
| Vercel Blob | Admin image uploads; the host is added to `images.remotePatterns`. |
| Vercel Cron | Nightly demo reset, authorised by `CRON_SECRET`. |
| Better Auth Infra | Dashboard (already connected). Production base URL set in M7. |

**Forms and tables.** TanStack Form with shadcn `Field`/`FieldGroup`; TanStack Table v9 (`useTable`). No react-hook-form (per `AGENTS.md`).

**UI.**
- Every new page uses the existing primitives, type roles and tokens.
- Listing pages use `ProductListing`.
- Editorial pages are typed block lists in `src/content/`, drawn by `src/components/editorial/`.
- New patterns are checked against Gucci's equivalent page (UK site) before building, without copying content.

## Testing strategy

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest | Pure rules: bag, stock, pricing, filter and sort parsing, search query building, role checks, editorial content integrity. |
| Integration | Vitest + PGlite | Query and action functions against real migrations and the seed. Includes the stock decrement under concurrent calls. |
| End-to-end | Playwright | One spec per journey: browse/filter/search, sign up/in/out/reset, saved items, bag → checkout (webhook triggered with a Stripe-signed test event, not by driving Stripe's page), order history, admin edit, demo admin limits. Desktop and mobile projects. |
| Accessibility | axe (Playwright) | From M7, every page type. |
| Visual review | Browser checks + Vercel preview | Implementer at 375/1024/1280/1440 px against tokens; user on the preview before merging. |

Tests are written first (red → green) for every behaviour a plan task introduces.

## Open items (settled in the named milestone's spec)

- **Email sending domain (M4).** Resend only sends to arbitrary addresses from a verified domain. If no domain is available by M4, password reset and order emails send only on previews to the owner's address, and the domain is added in M7.
- **Product photography (M2): settled** in the [M2 spec](2026-10-04-m2-browse-design.md):
  - free Unsplash photos, with plain backgrounds first;
  - each photo checked for brand marks;
  - approved on a contact sheet.
- **Pagination style and price filter control (M3): settled** in the [M3 spec](2026-10-05-m3-find-design.md): a "Load more" button, and price bands with counts.
- **Function region (M3): settled.** Neon runs in AWS US East, next to Vercel's default `iad1`, so no change is needed.
- **Demo reset window (M6).** How long demo orders and carts live before the nightly reset clears them.
- **Monitoring vendor (M7).** Which error-monitoring service; free tier only.

## Risks

- **Stripe webhooks on previews.** Every preview needs a reachable webhook endpoint and its own signing secret. Mitigation: the webhook path is tested in CI with signed test events; previews use the Stripe CLI or a per-preview endpoint, decided in M5.
- **Neon branch sprawl.** One database branch per preview. Mitigation: the integration's automatic cleanup when a pull request closes.
- **Demo abuse.** The public admin and checkout can be spammed. Mitigation: rate limits on the demo login and checkout, nightly reset, and limits on demo-admin permissions.
- **Workflow skills not installed.** The writing-plans and executing-plans skills refer to companion skills (test-driven-development, subagent-driven-development, using-git-worktrees, requesting-code-review, finishing-a-development-branch) and a `sdd-workspace` script that aren't installed. Until they are, execution follows their intent: tests first, a ledger per plan, a fresh-context whole-branch review before each pull request.
