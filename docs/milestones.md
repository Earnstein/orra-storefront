# Milestones

Each milestone is a group of merged pull requests, recorded here with its tag and GitHub Release when the last one merges. Newest first. Process: see "How we ship" in `CLAUDE.md` and the roadmap spec in `docs/superpowers/specs/`.

## v0.6.0 — Bag & checkout · 2026-10-17
- **Scope:**
  - **The bag on the server:** Postgres carts with a signed guest cookie, and a count cookie so the header makes no request. Quantities are capped at live stock and 10 per item. A guest's bag merges into the account on sign-in, and pre-M5 browser bags were imported once.
  - **`/bag` and the added-to-bag panel:** quantity, Remove with Undo, Move to saved items, and stock notes.
  - **Checkout on our own page:**
    - an email gate (guest or sign in);
    - our own delivery form, with a filterable State list and a US ZIP check;
    - Stripe's card fields, in test mode.
    - Stock is held for 31 minutes while the shopper pays, so two shoppers racing for the last unit get one hold and one "sold out".
  - **Orders:** Stripe only authorises, and the money is captured once the order is recorded.
    - A hold that ran out takes its stock again, or the payment is cancelled ("sold out while you were paying").
    - The webhook and the success page can both fulfil, safely and at the same time. Anything uncertain is retried rather than answered as "not charged".
    - The confirmation email is sent once, and retried after a failure.
  - **Order history** in the account (list and detail), and a guest order link carrying a key that's stored hashed.
- **Pull requests:** [#31 M5 Bag & checkout spec and plan](https://github.com/Earnstein/orra-storefront/pull/31) · [#32 Move the bag to the server](https://github.com/Earnstein/orra-storefront/pull/32) · [#33 Add the bag page and the added-to-bag panel](https://github.com/Earnstein/orra-storefront/pull/33) · [#34 Compare the bag subtotal exactly in the quantity test](https://github.com/Earnstein/orra-storefront/pull/34) · [#35 Add checkout with stock held while you pay](https://github.com/Earnstein/orra-storefront/pull/35) · [#36 Add orders, the webhook and the confirmation email](https://github.com/Earnstein/orra-storefront/pull/36) · [#37 Add order history](https://github.com/Earnstein/orra-storefront/pull/37) · [#38 Read the bag in one statement](https://github.com/Earnstein/orra-storefront/pull/38) · [#39 Collect the delivery address in our own fields; shadcn selects](https://github.com/Earnstein/orra-storefront/pull/39) · [#40 Milestone log](https://github.com/Earnstein/orra-storefront/pull/40)
- **Release:** https://github.com/Earnstein/orra-storefront/releases/tag/v0.6.0
- **URL:** https://orra-storefront.vercel.app
- **Budgets (measured on production; LCP on local builds, as in M3 and M4):**
  - **`GET /api/bag` server time:** 35–56 ms, median 36 ms (budget 50 ms).
    - It measured a median of 55 ms first; #38 read the bag in one statement instead of two.
  - **`startCheckout`:** 1,556 ms for a new hold and its Stripe session, and 572 ms for a resumed one (budget 1.5 s).
    - Both were measured from the client, so they include the network from Lagos to Vercel's `iad1`; the server's share is lower.
  - **Webhook handling:** budget 1 s. Not measured here: Stripe's dashboard shows each delivery's response time.
  - **Stripe's JavaScript:** loads only on `/checkout`, in the form's lazy chunk.
  - **LCP against `v0.5.0`:** mobile emulation with 4× CPU and 1.6 Mbps / 150 ms, 5 runs each (budget: no worse).
    - `/collections/women`: 1,156 against 1,156 ms.
    - `/products/leather-tote-tan`: 3,420 against 3,432 ms.
- **Exit check:**
  - **e2e against production** (without `@writes`): 202 passed.
    - The "checkout isn't available without Stripe keys" test failed there, because production now has keys. It now skips on deployed sites (this PR).
  - **A test purchase on production** (exit criterion 1): a guest purchase by the owner went through and the confirmation email arrived.
    - Stock dropping, the order in history and the email are also covered in e2e on the dev database, as a guest and signed in.
  - **Production checkout up to Pay:** our delivery form and Stripe's card fields load with no console errors. The guest order page sends `private, no-store` and `no-referrer`.
  - **Races on the Neon dev branch** (exit criteria 2 and 3), e2e and unit:
    - two shoppers for the last unit get one hold and one "sold out";
    - a hold that ran out while its stock sold gives no order and a cancelled payment.
  - **Reviews:** fresh-context reviews of the checkout, orders and order-history branches. Their important findings are fixed: uncertain captures and failed undos are now retried, and past delivery estimates are hidden.
- **Carried forward:**
  - Before v1.0.0: rotate the Neon production database password, and add an email sending domain.
  - M7 (with email verification):
    - guest orders join the account whose verified email placed them;
    - a guest who signs in between paying and the success page sees "Order received", though the order itself is fine.
  - M6:
    - its nightly job resends order emails that never went out;
    - admin edits should call `updateTag("catalog")`, and keep the endpoints' CDN caching from lagging behind it;
    - products should be archived, not deleted, once orders refer to them.
  - **Delivery dates:** worked out in one store time zone, since the page uses the shopper's zone and the email UTC.
  - **Order pages:** they answer 200 (the not-found page, noindex) for another shopper's order or a wrong key. A real 404 would need a database lookup in the proxy.
  - **Stripe's address autocomplete** went with its address form (#39); browser autofill still works.
  - **Checkout e2e tests that pay:** they need Stripe test keys, so they skip in CI until the keys are added as GitHub secrets.
  - **Still open from M3 and M4:** keyset pagination and an index-friendly typo match at a much larger catalogue; not-found pages have no `<title>`; the saved-items and auth minors listed under v0.5.0. M5 did narrow the search triggers, as M3 asked.

## v0.5.0 — Accounts · 2026-10-11
- **Scope:**
  - Better Auth with email and password on separate `/sign-in` and `/sign-up` pages, and password reset by email (Resend's test sender until M7 adds a domain).
  - Session and safety rules: 30-day sessions with a 5-minute cookie cache, rate limits stored in the database, and deleting an account always asks for the password.
  - Header account menu. `/account` holds the profile (name), password change, signed-in devices (sign out one or all others) and account deletion.
  - Saved items across devices: they're kept in the account when signed in, the browser's items merge in on sign-in, and `/saved` lists them. Saves update on screen at once and stay in click order.
  - Environments: previews delete the accounts they copy from production. Production is migrated but never seeded.
  - Speed: pages read the session without Better Auth's browser client, the account menu loads on first use, and a server-side session check is one database query.
- **Pull requests:** [#22 M4 Accounts spec and plan](https://github.com/Earnstein/orra-storefront/pull/22) · [#23 Auth foundation](https://github.com/Earnstein/orra-storefront/pull/23) · [#24 Sign in, sign up, password reset and the account menu](https://github.com/Earnstein/orra-storefront/pull/24) · [#25 Keep the query in Sign in's returnTo](https://github.com/Earnstein/orra-storefront/pull/25) · [#26 Account page](https://github.com/Earnstein/orra-storefront/pull/26) · [#27 Saved items across devices](https://github.com/Earnstein/orra-storefront/pull/27) · [#28 Page-speed budget](https://github.com/Earnstein/orra-storefront/pull/28) · [#29 Milestone log](https://github.com/Earnstein/orra-storefront/pull/29)
- **Release:** https://github.com/Earnstein/orra-storefront/releases/tag/v0.5.0
- **URL:** https://orra-storefront.vercel.app
- **Budgets (measured on production; LCP on local builds, as in M3):**
  - `/api/products/summaries` server time: 18–20 ms for sets never asked before (one sample 87 ms); repeats are served by the CDN (budget 50 ms).
  - `/api/saved` server time: about 35 ms (budget 50 ms), down from 56 ms before #28 joined the session and user into one query. It sends no `Server-Timing`, so this is signed-in minus signed-out time over 40 interleaved pairs.
  - Header session check: no database read while the cookie cache holds (`get-session` answers about 20 ms faster from the cookie).
  - LCP, mobile emulation with 4× CPU and 1.6 Mbps / 150 ms, 5 runs each against `v0.4.0` (budget: no worse):
    - `/collections/women`: 1,168 against 1,152 ms.
    - `/products/leather-tote-tan`: 4,004–4,012 against 3,960–3,980 ms. That's about 1% behind, down from 288 ms behind before #28. The remaining 13 KB of JavaScript per page is the session read and saved-items sync that accounts need.
- **Exit check:**
  - The e2e suite against production passed: 147 tests, without the `@writes` tests that create accounts. The 4 password-reset tests skip there because they read the local email outbox.
  - One sign-up-then-delete smoke test passed.
  - The menu-fallback test first failed on production because it blocked chunks under `/_next/static/chunks/`, while Vercel serves them from `/_next/static/immutable/chunks/`. This PR fixes the test.
- **Carried forward:**
  - Rotate the Neon production database password, and add an email sending domain (both before v1.0.0).
  - From M3: narrow the search triggers before M5 writes stock; keep the endpoints' CDN caching from lagging the catalogue cache when M6 adds admin edits; at a much larger catalogue, keyset pagination and an index-friendly typo match; not-found pages have no `<title>`.
  - Saved items:
    - A product page shows "Save for later" for a moment while a signed-in visitor's list loads.
    - A full account merges the browser's oldest items first.
    - Each removal on `/saved` re-reads the cards.
    - `/api/saved` has no `Server-Timing`.
  - Auth:
    - No e2e coverage for a session ending during a password change, the devices list or deletion.
    - `auth.ts`'s wiring isn't unit-tested.
    - Production logs include the reset email's recipient.
    - Visitors behind a proxy chain share one rate-limit bucket.
    - A preview's two URLs keep separate cookies.
    - `safeReturnTo` doesn't decode percent-encoded paths.

## v0.4.0 — Find · 2026-10-05
- **Scope:**
  - Cache Components: cached catalogue reads with one `catalog` tag; listings and search stream their results.
  - Product search: a weighted full-text index kept current by triggers, every word must match, typos within reach ("lether" finds leather), relevance ranking.
  - Filters and sort on every listing, held in the URL: a filter sheet with a draft and one history entry per change, chips, colour swatches, price bands, In stock and New in.
  - Load more: one page per click, and a reload restores up to 10 pages. Results carry only what a product card shows.
  - Header search panel: popular searches, live suggestions with categories and "See all"; and a `/search` page with the same filters.
  - Fixes carried from M2: complete rows under "You may also like", Women and Men breadcrumbs to the landings, e2e tests no longer wait for every image.
- **Pull requests:** [#15 M3 Find spec and plan](https://github.com/Earnstein/orra-storefront/pull/15) · [#16 Move to Cache Components](https://github.com/Earnstein/orra-storefront/pull/16) · [#17 Product search index and results query](https://github.com/Earnstein/orra-storefront/pull/17) · [#18 Filters, sort and load more on every listing](https://github.com/Earnstein/orra-storefront/pull/18) · [#19 Live search](https://github.com/Earnstein/orra-storefront/pull/19)
- **Release:** https://github.com/Earnstein/orra-storefront/releases/tag/v0.4.0
- **URL:** https://orra-storefront.vercel.app
- **Budgets (measured on production; the plan said preview, which sits behind the Vercel login):**
  - `/api/products` and `/api/search/suggest` server time: 20–41 ms for queries never asked before (budget 150 ms), 17–38 ms cached (budget 50 ms).
  - Search panel, last keystroke to results with a warm cache: 289–305 ms from a client far from `iad1` (budget 300 ms; 200 ms of it is the debounce).
  - `/collections/women` LCP, mobile emulation with 4× CPU and network throttling, 5 runs each, both builds locally: median 1,372 ms against M2's 1,456 ms (budget: no worse).
- **Exit check:** the full e2e suite against production passed twice in a row (240 tests), after one unrepeated failure of the open-search-panel axe test.
- **Carried forward:**
  - Rotate the Neon production database password (before v1.0.0).
  - Narrow the search triggers so stock-only updates don't rebuild the index (before M5 writes stock).
  - When M6 adds admin edits, keep the endpoints' CDN caching (`stale-while-revalidate=600`) from lagging the catalogue cache.
  - At a much larger catalogue: keyset pagination, an index-friendly typo match, and `content-visibility` on long listings.
  - Not-found pages have no `<title>`.

## v0.3.0 — Browse · 2026-10-05
- **Scope:** styled 404 and error pages; collection pages for New, Women, Men and each category, with category tabs and a product `audience` field (women, men, unisex); 48 products, each with a colour family and a material, from photos checked for brand marks; production-safe database scripts (`db:seed` and `db:migrate` refuse production unless asked, and local development uses its own Neon branch); an editorial block system with two stories; Women and Men landing pages, now the primary nav's destinations.
- **Pull requests:** [#8 M2 Browse spec and plan](https://github.com/Earnstein/orra-storefront/pull/8) · [#9 Styled 404 and error pages](https://github.com/Earnstein/orra-storefront/pull/9) · [#10 Collection pages, the audience field and production-safe db scripts](https://github.com/Earnstein/orra-storefront/pull/10) · [#11 Catalogue grown to 48 products with colour family and material](https://github.com/Earnstein/orra-storefront/pull/11) · [#12 Stories on an editorial block system](https://github.com/Earnstein/orra-storefront/pull/12) · [#13 Women and Men landing pages](https://github.com/Earnstein/orra-storefront/pull/13)
- **Release:** https://github.com/Earnstein/orra-storefront/releases/tag/v0.3.0
- **URL:** https://orra-storefront.vercel.app
- **Carried forward:** M3 Find decides the pagination style ("load more" or numbered pages), the price filter control (bands or a range) and the Vercel function region (next to the Neon database); the e2e empty-state test has nothing to exercise now that every Women and Men tab has products; rotate the Neon production database password (before v1.0.0).

## v0.2.0 — Delivery pipeline · 2026-10-04
- **Scope:** GitHub repository (public, squash merges only); Vitest unit tests and catalogue query tests on in-memory Postgres (PGlite); Playwright smoke tests on desktop and mobile; CI on GitHub Actions with a throwaway Neon branch per run and masked credentials; protected `main` (pull request plus `checks` and `e2e` required); Vercel production and per-PR previews, each preview on its own Neon branch (migrated and seeded), production migrated but never seeded, with a guard that stops a preview from touching the production database; PR template and this milestone log.
- **Pull requests:** [#1 Roadmap to v1.0.0 and M1 plan](https://github.com/Earnstein/orra-storefront/pull/1) · [#2 PR template, milestone log and shipping process](https://github.com/Earnstein/orra-storefront/pull/2) · [#3 Vitest unit tests and PGlite query tests](https://github.com/Earnstein/orra-storefront/pull/3) · [#4 Playwright smoke tests](https://github.com/Earnstein/orra-storefront/pull/4) · [#5 CI](https://github.com/Earnstein/orra-storefront/pull/5) · [#6 Vercel build for previews and production](https://github.com/Earnstein/orra-storefront/pull/6)
- **Release:** https://github.com/Earnstein/orra-storefront/releases/tag/v0.2.0
- **URL:** https://orra-storefront.vercel.app
- **Carried forward:** rotate the Neon production database password (before v1.0.0); give local development its own Neon branch (before M3).

## v0.1.0 — Baseline · 2026-10-04
- **Scope:** Homepage, product pages, New arrivals, Postgres catalogue, Better Auth wiring.
- **Pull requests:** none (before GitHub)
- **Release:** https://github.com/Earnstein/orra-storefront/releases/tag/v0.1.0
- **URL:** not deployed
