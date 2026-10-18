# Orra M6: store admin (design)

- **Date:** 2026-10-18
- **Status:** awaiting review
- **Milestone:** M6 Store admin → `v0.7.0`, as scoped in the [roadmap](2026-10-04-roadmap-to-live-design.md)
- **Scope of this spec:**
  - roles on Better Auth's admin plugin, and the admin area;
  - product management, with image uploads and immediate storefront refresh;
  - order management;
  - the public "Try the admin" demo login;
  - the nightly demo reset, which also sends any order email that never went out;
  - their tests.

  The M6 plan (`docs/superpowers/plans/2026-10-18-m6-admin.md`) turns it into tasks.
- **Not in this spec:** user management screens, a verified email domain and email verification (M7), monitoring and SEO (M7), Paystack (`v1.1.0`).

## Intent

**What M6 is for:** the store can be run from the browser, and anyone looking at the demo can try running it.
- The owner signs in with their own account and manages products and orders at `/admin`.
- A visitor clicks "Try the admin", lands in the same admin as a shared demo account, edits a product and sees the change on the storefront straight away.
- Every night the demo goes back to its seed: whatever visitors changed is gone, while accounts, roles and the owner's account are untouched.

**How this spec was written:** the user chose to have it written from the roadmap's M6 outline instead of brainstorming it. The roadmap's decisions are kept as they were. Everything the roadmap left open is decided here and marked **(my call)**, so the user can check those while reading.

| Question | Decision |
|---|---|
| Roles (roadmap) | Better Auth's `admin` plugin; roles `admin` (the owner) and `demo-admin`; every admin page, route and action checks the role on the server. |
| Products (roadmap) | `/admin/products`, a TanStack Table v9 list with search and sort; create and edit with TanStack Form; images uploaded to Vercel Blob with alt text; edits refresh the storefront immediately. |
| Orders (roadmap) | `/admin/orders`: list, detail, and status changes (paid → fulfilled, cancel). |
| Demo admin (roadmap) | "Try the admin" signs into a shared `demo-admin` account. Rate-limited, and unable to manage users, roles or the owner's account. |
| Demo reset (roadmap) | A nightly Vercel Cron job restores the catalogue and stock to the seed, removes products that aren't in the seed, clears old orders and carts, and sends unsent order emails. On the demo the seed is the catalogue's source of truth. |
| What a demo admin may do with orders | **(my call)** Read only, with each customer's name, email and address masked. The demo admin is public, so it must never show real visitors' details. A stranger shouldn't be able to cancel a real visitor's order either. Only the owner fulfils and cancels. |
| Deleting a product | **(my call)** Archive, not delete. An archived product leaves the storefront and its page 404s. A bag still holding it shows the line as "No longer available", outside the count. Orders and holds keep pointing at it. This is M5's carried-forward item. Restoring brings it back. |
| How long demo data lives | **(my call)** 30 days, which settles the roadmap's open "demo reset window" item. The reset removes carts untouched for 30 days, and orders and checkouts older than 30 days. It matches the guest bag cookie's 30-day life, and a visitor can still find last week's test order. |
| Cancelling an order | **(my call)** The owner can cancel a `paid` order. That refunds it through the payment provider (`undo`), puts the stock back, and marks it `cancelled`. No email is sent; cancellation emails wait for M7's domain. |
| TanStack DB (carried from the roadmap) | **(my call) Not adopted.** The admin lists are server-paged reads that TanStack Query already handles, and it's still pre-1.0. |
| Admin look | **(my call)** The storefront's design system: same type roles, tokens and primitives, monochrome, square. A plain admin header (Products, Orders, View store, the account) replaces the storefront's header and footer, and no Gucci reference is needed. |

## Exit criterion (from the roadmap)

A visitor edits a product through "Try the admin", sees the change on the storefront, and it is gone after the next reset. The owner's account and role are unaffected.

## Out of scope

- User management screens (listing, banning or deleting users, or changing roles in the UI). The owner's role is set with a script.
- Impersonation, and bans. The plugin's endpoints for these exist, but nothing in the UI uses them, and the demo admin is denied them.
- Variants, bulk edits, CSV import and export, discounts, a shipping integration, and customer emails for fulfilment or cancellation.
- Editorial content (stories, landings) stays in code.

## Modules

| # | Branch | Delivers |
|---|---|---|
| 1 | `docs/m6-admin` | This spec, the plan, and the roadmap changes below. |
| 2 | `feat/admin-roles` | The admin plugin with access control, the regenerated auth schema and migration, role checks, the `/admin` shell and its guard, and the script that grants the owner's role. |
| 3 | `feat/admin-products` | `products.archived_at` and the storefront hiding archived products; the products table; create, edit, archive and restore; Vercel Blob image uploads; immediate storefront refresh, the API's CDN cache included. |
| 4 | `feat/admin-orders` | The `fulfilled` status; the orders table and detail; fulfil and cancel for the owner; read-only masked orders for the demo admin. |
| 5 | `feat/demo-admin` | "Try the admin": the demo account, the sign-in route and its rate limit; e2e proof of the demo admin's limits. |
| 6 | `feat/demo-reset` | The nightly reset route and its cron; the order email retry; image clean-up. |
| 7 | `docs/milestone-v0.7.0` | The exit check on production, budgets, the `v0.7.0` tag and release. |

## Roles and access (module 2)

**Plugin.** `admin()` from `better-auth/plugins` is added in `src/lib/auth.options.ts`, before `nextCookies()`.
- `npm run auth:generate` adds the plugin's fields: `user.role`, `banned`, `ban_reason`, `ban_expires` and `session.impersonated_by`. Then `db:generate` and `db:migrate`, as for every schema change.
- New users get the role `user`.

**Access control** (`src/lib/auth/permissions.ts`, client-safe). The plugin's default statements, plus two of ours:

| Resource | Actions |
|---|---|
| `product` | `create`, `update`, `archive`, `upload` |
| `order` | `read`, `read-details` (unmasked name, email and address), `fulfil`, `cancel` |

| Role | Gets |
|---|---|
| `admin` | Every action above, and the plugin's user and session actions. |
| `demo-admin` | `product`: all four. `order`: `read`. No user or session actions, so the plugin's endpoints answer 403. |
| `user` | Nothing. |

`adminRoles` is `["admin"]`, so only the owner counts as an admin to the plugin itself.

**Checks.**
- **`requireAdmin(permission?)`** (`src/lib/admin/session.ts`, server-only):
  - It reads the uncached session (as `requireUser` does).
  - A visitor who isn't signed in is sent to `/sign-in?returnTo=…`.
  - A signed-in user with neither admin role gets `notFound()`, so the admin isn't advertised.
  - A missing permission throws, and actions and routes answer 403.
- **Every admin server action and route handler calls it first.** Pages call it under `<Suspense>`.
- **The demo admin's limits are enforced on the server**, never just hidden in the UI.

**`/admin` shell** (`src/app/admin/layout.tsx`):
- `noindex`, with its own header: Products, Orders, View store, and the account with Sign out.
- A visible "Demo admin — changes reset nightly" band when the role is `demo-admin`.
- `/admin` redirects to `/admin/products`.
- **`src/proxy.ts`** also matches `/admin/:path*`, sending visitors without a session cookie to sign in, as it does for `/account`.

**Granting the owner's role.**
- `npm run admin:grant -- <email>` (`scripts/grant-admin.ts`) sets `role = 'admin'` for an existing account.
- It follows the database guards of `db:seed` and `db:migrate`: it refuses production unless run with `--production`, and prints which database it touches.
- The owner runs it once on production after module 2 deploys.

## Products (module 3)

**Archiving** (`products.archived_at`, nullable; migration plus `src/db/schema/catalog.ts`):
- **Storefront reads skip archived products.** That covers every catalogue read in `src/lib/catalog/queries.ts`, `getResults` and the search suggestions. Their cache tags and lifetimes stay as they are.
- An archived product's page 404s.
- **The bag** marks an archived product's line `unavailable` ("No longer available", outside the count and subtotal), and a new add refuses it.
- **Editorial pages** skip an archived product instead of breaking.
- **Checkout** treats archived products as having no stock.
- **Orders and holds keep their rows.**

**`/admin/products`:**
- TanStack Table v9 (`useTable`) with TanStack Query over `GET /api/admin/products`, which needs the `product:update` permission and answers `private, no-store`.
- Columns: photo, name and slug, category, audience, price, stock, status (Active or Archived).
- Search by name or slug, sort by name, price, stock or newest, filter Active or Archived, and 25 rows a page with server paging. The table's state lives in the URL (nuqs, as the listings).

**Create and edit** (`/admin/products/new`, `/admin/products/[slug]`):
- One TanStack Form with the Zod schema shared with the server action.
- Fields:
  - name;
  - slug (generated from the name on create, editable, unique, never an existing or reserved slug);
  - category, audience, colour (free text);
  - colour family and material (from the vocabularies);
  - price (dollars in the form, cents stored);
  - stock;
  - description;
  - details (ordered term and value pairs);
  - images (ordered, at least one, each with required alt text).
- Saving runs a server action (`saveProduct`) that validates everything again on the server.
- **Stock is "available now":** units in open holds aren't included, and the form shows "N more held in checkouts". A save writes stock only if it hasn't changed since the form loaded (a sale meanwhile); otherwise it asks to reload.
- **Slugs:** a slug that stories or landings reference (`src/content/`) can't be changed, since the content would break. Bags and saved items follow the product, because they key on its id.
- Archive and Restore are their own actions.
- **Every catalogue write calls `updateTag("catalog")`**, so product pages, listings, the homepage and search refresh on the next request.

**The API's CDN cache.** `/api/products`, `/api/products/summaries` and `/api/search/suggest` send `s-maxage=300, stale-while-revalidate=600`, so Vercel's CDN can serve a listing that's up to 15 minutes old after an edit. The plan picks one of two fixes:
- purge those responses by tag on every catalogue write (Vercel's cache tags, if they work with these routes on the installed versions);
- or shorten them to `s-maxage=60, stale-while-revalidate=60`, which keeps M3's speed budgets.

Either way, an edit must show in listings and search within a minute.

**Images:**
- Vercel Blob (`@vercel/blob`, new dependency) with client uploads. `POST /api/admin/uploads` (`handleUpload`) issues a token only to a session with `product:upload`.
- JPEG, PNG or WebP, at most 4 MB, stored under `products/`.
- The Blob host is added to `images.remotePatterns`, and those images go through Next's optimiser via the existing custom loader. Unsplash URLs keep going to Unsplash's CDN.
- The seed keeps its Unsplash photos.
- `BLOB_READ_WRITE_TOKEN` is optional in `src/lib/env.ts`. Without it the upload control says uploads aren't configured, and image URLs can still be added from the list of the seed's photos.

## Orders (module 4)

- **Status:** `order_status` gains `fulfilled` (migration), and orders gain `fulfilled_at` and `cancelled_at`.
- **`/admin/orders`:** a TanStack Table of number, date, customer, status, total and item count; search by number or email; filter by status; newest first; server paging. It reads `GET /api/admin/orders`, which needs `order:read`.
- **`/admin/orders/[number]`:** the items, the delivery address, the payment summary, the status history (placed, fulfilled or cancelled, with times), and the actions.
- **Fulfil** (`order:fulfil`): `paid` → `fulfilled`. Order history and the guest order page show "Fulfilled", and the estimated delivery stays.
- **Cancel** (`order:cancel`):
  - `paid` → `cancelled`, refunded through the payment provider's `undo`.
  - The order's stock is put back once, using the same CTE pattern as the capture-failure path.
  - A failed refund leaves the order `paid` and says so; no stock moves.
  - Fulfilled orders can't be cancelled.
- **Masking for the demo admin:**
  - Customer names and emails show as initials and the email's domain, for example `A. L.` and `•••@example.test`.
  - Addresses show only the city and state.
  - The masking is done on the server in the API answer, never just in the UI.

## Demo admin (module 5)

**The demo account:**
- A real Better Auth user with the role `demo-admin` and an email at a reserved domain (`demo-admin@orra.invalid`). Its password is random and never shown.
- It's created on first use (`ON CONFLICT DO NOTHING`).
- Nothing in its data is personal.

**"Try the admin":**
- A link in the footer and a button on the signed-out `/admin` page (`/admin/try`, with a short explanation: what the demo admin can do, that changes reset nightly, and that it signs you out of your own account).
- The button posts to `POST /api/demo-admin`:
  1. checks the request is from the same origin;
  2. applies a rate limit of 5 per IP per 10 minutes, in the existing `rate_limit` table;
  3. ends any current session;
  4. creates a session for the demo account through Better Auth's server API and sets its cookie;
  5. sends the visitor to `/admin/products`.
- Demo sessions last 2 hours (my call), shorter than the 30-day default.

**Guards:**
- The owner's account can't be reached from a demo session. The demo role has no user or session permissions, and `requireAdmin` never accepts `demo-admin` for an owner-only action.
- Signing out of the demo works like any sign-out.

## Demo reset (module 6)

**Trigger:**
- `vercel.json` gains a cron at 03:00 UTC daily for `GET /api/cron/demo-reset`.
- The route answers 401 unless `Authorization: Bearer ${CRON_SECRET}`; `CRON_SECRET` is required on production and optional elsewhere.
- It runs on production only. On a preview or locally it can be run by hand with the secret, against that environment's own database.

**Steps, in order.** Each step is idempotent, and a failed step is logged without stopping the steps after it:
1. **Release expired holds** (`releaseExpiredHolds`).
2. **Clear old data:**
   - carts not updated for 30 days;
   - non-open checkouts and their items older than 30 days;
   - orders older than 30 days (their items cascade).
3. **Restore the seed:** `seedCatalog`, which upserts categories and products by slug and so restores content and stock, and clears `archived_at` on seed products. Restored stock is the seed's stock minus units still in open holds (never below 0), so releasing a hold later doesn't push it above the seed.
4. **Products not in the seed:**
   - deleted where nothing refers to them;
   - archived where a recent hold or order item still does (they're deleted on a later night).
5. **Images:** Blob images under `products/` that no product refers to are deleted.
6. **Order emails:** confirmation emails still unsent for `paid` orders are sent, through M5's claim, send and record.
7. **Refresh:** `revalidateTag("catalog", { expire: 0 })`, plus the CDN purge if module 3 chose one.

The route answers a JSON summary with the counts per step, and logs it.

**Production seeding (a deliberate change):**
- Until now production was "migrated but never seeded".
- From M6 the reset re-seeds production every night, as the roadmap decided: on the demo, catalogue changes meant to last go into the seed.
- The `db:seed` script's guard stays (a person seeding production still needs `--production`). `CLAUDE.md` records the exception.

**What's never touched:** users, sessions, roles, the owner's account, saved items (apart from cascades from deleted products), and the reset of accounts on previews (`db:clear-accounts`).

## Errors and security

- **Server-side checks:** every admin read and write checks the session and the permission on the server, and inputs are validated with Zod. Prices and stock are integers within limits: price from 0 to $1,000,000, stock from 0 to 100,000.
- **Same origin only:** admin route handlers check the Origin, as `/api/bag` does; server actions get Next's own check.
- **Demo admin:**
  - It can't change roles, users or sessions, and never sees personal data.
  - Its sessions are short.
  - Its sign-in is rate-limited.
  - Its uploads are limited in type and size.
- **Reset route:** secret-protected, and it never runs a step against a database not confirmed as the one it's deployed with.
- **Not found, not forbidden:** admin pages answer not-found to signed-in non-admins.

## Testing

| Layer | Covers |
|---|---|
| Unit | Permissions per role, product and order schemas, slug generation, the masking, price conversion. |
| Database (PGlite) | Archived products hidden from every catalogue read, the bag and checkout. `saveProduct`, archive and restore. Fulfil and cancel: the refund through the fake provider, stock returned once, and a failed refund changing nothing. Each reset step, including products still referenced by holds, and running the reset twice. The demo account created once. |
| Auth (`createTestAuth`) | The plugin's endpoints refuse the demo admin (403) and accept the owner. `requireAdmin` sends non-admins to not-found. |
| End-to-end (Playwright, desktop and mobile) | "Try the admin" → edit a product's name and price → the product page and a listing show it; the demo admin can't reach user management (403) and sees masked orders. The owner, given the role in a local-only test database step, fulfils and cancels an order. Uploading an image (local runs with a Blob token; skipped without one). The reset route with the secret restores the edited product (local test database only). axe on the admin pages. |

## Performance budgets

| Measure | Budget |
|---|---|
| Storefront JavaScript and LCP | No change from `v0.6.0`: the admin's code (tables, forms, Blob client) loads only under `/admin`. |
| An edit showing on the storefront | Product page and homepage on the next request; listings and search within a minute. |
| `GET /api/admin/products` and `GET /api/admin/orders` server time | Under 150 ms for a page of 25. |
| The demo reset | Finishes within the function's time limit (under 60 s at the seed's size). |

## Docs and roadmap changes

- **`CLAUDE.md`:** roles and permissions, the admin area, archiving, image uploads, the demo admin, the reset and the production-seeding exception, and the new env vars (`BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`).
- **`.env.example`:** the two new variables.
- **Roadmap:**
  - the reset window (30 days) settles its open item;
  - demo admins read masked orders and can't change them;
  - products are archived, not deleted;
  - TanStack DB isn't adopted for the admin.

## Risks

- **Demo abuse.** Anyone can edit the demo's products for up to a day, upload images and try to break things. Mitigations:
  - the rate limit on the demo sign-in;
  - limits on upload type and size;
  - the nightly reset;
  - masked orders.

  A visitor could still put an offensive name or picture on the storefront until the reset. That's accepted for a demo. If it ever happens, the owner restores the product, or a rule is added that demo edits show only to the demo session.
- **Blob costs.** Uploads are capped in size, and unreferenced images are deleted nightly.
- **Re-seeding production.** A bug in the reset could damage the catalogue. Mitigations: the reset is tested against PGlite with real migrations, every step is idempotent, and the seed is the source of truth anyway.
- **Previews behind the Vercel login.** The demo admin is checked on production for the exit check, as M5's purchase was.

## Left to the plan

- The exact file names beyond those above, and the task order within each module.
- How Better Auth's server API creates the demo session.
- The choice between the CDN purge and shorter cache times.
- The table's exact column widths and mobile layout. Below `md` the tables become stacked rows.
