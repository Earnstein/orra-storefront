# Orra M7: launch (design)

- **Date:** 2026-10-30
- **Status:** awaiting review
- **Milestone:** M7 Launch → `v1.0.0`, as scoped in the [roadmap](2026-10-04-roadmap-to-live-design.md)
- **Scope of this spec:**
  - production as it launches, without a custom domain;
  - error monitoring and analytics;
  - help and legal pages, and the end of links with no page;
  - SEO: sitemap, robots, canonical URLs and sharing images;
  - quality gates in CI: accessibility on every page type, Lighthouse budgets and a link check;
  - the README and the `/about` case study;
  - the `v1.0.0` exit check.

  The M7 plan (`docs/superpowers/plans/2026-10-30-m7-launch.md`) turns it into tasks.
- **Not in this spec:** a custom domain, a verified sending domain and anything that needs one (below); Paystack (`v1.1.0`).

## Intent

**What M7 is for:** the demo is finished and can be shown to anyone. Every link goes somewhere real, every page says only true things about a demo, search engines and link previews see it properly, and CI keeps it that way: a regression in accessibility, speed or links fails the build.

**How this spec was written:** the user chose to have it written from the roadmap's M7 outline instead of brainstorming it, and decided one thing first: **no domain**. The roadmap's other decisions are kept. Everything it left open is decided here and marked **(my call)**.

| Question | Decision |
|---|---|
| Domain (user) | **None.** The store launches on `orra-storefront.vercel.app`. |
| Email without a domain | **(my call)** Resend's test sender stays, so emails reach only the owner's address. Pages stop promising more ("…until launch" goes), and the success criterion about receiving the email is proven with the owner's own purchase. |
| Email verification, changing your email, guest orders joining an account | **(my call) Out of `v1.0.0`.** All three need emails that reach visitors. They move to the roadmap's after-launch list, next to Paystack. The account page simply shows the email as read-only. |
| Better Auth Infra | The dashboard's base URL moves from the ngrok tunnel to the production URL (an owner step in the dashboard). |
| Monitoring vendor (roadmap open item) | **(my call)** Sentry's free plan, reporting from the server, with browser errors relayed through our own route instead of Sentry's 29 KB browser SDK; Vercel Web Analytics for page views. Compared in **Monitoring and analytics**. |
| Links with no page (roadmap) | **(my call)** Pages for what a demo can honestly offer, and the rest removed. Built: Contact, Delivery, Returns, Privacy, Terms, Cookies, and `/about`. Removed: Find a store, Size guide (products have no sizes), the Services column (gift wrapping, repairs, appointments: none exist), Materials and Careers. |
| The homepage's "Gift wrapping" service | **(my call)** It says wrapping can be added at checkout, which isn't true. It's replaced with "Test payments only: pay with Stripe's test card; no real money is taken." |
| Sharing images | **(my call)** Photos, not generated cards: the brand is imagery-first, and the pages already have them. Home uses the first hero slide, listings their newest product's photo; products, stories and landings keep theirs. |
| Lighthouse in CI | **(my call)** Against the production build CI already serves on `:3100`, not against previews (they sit behind the Vercel login). Budgets are fixed from measured runs (see **Quality gates**). |
| The case study | **(my call)** `/about` inside the storefront frame, written in the house style, with screenshots committed under `public/case-study/`, and a README rewritten to match. |

## Success criteria for `v1.0.0` (revised)

The roadmap's criteria, with the email one rewritten for launching without a domain:

1. On the production URL, a visitor can:
   - follow every nav link to a working page (a listing or an editorial landing page) and read the stories;
   - filter, sort and page through listings, and search with results that appear as they type;
   - sign up and sign in, and save items;
   - add to bag and pay with a Stripe test card;
   - see the order confirmation and see the order in their account. **The confirmation email is proven with the owner's purchase**, since only the owner's address receives emails;
   - open the admin via "Try the admin" and edit a product.
2. Stock never goes below zero and a unit is never sold twice, including under concurrent checkouts.
3. Every internal link resolves (no 404s from the header, footer or pages).
4. CI (lint, typecheck, unit, end-to-end, build) and the launch checks (accessibility, performance budgets) pass on `main`. The link check (module 5) runs with them.
5. `docs/milestones.md` lists `v0.1.0` → `v1.0.0`, each with its tag, GitHub Release and pull requests.

## Out of scope

- A custom domain and a verified sending domain, and so email verification, email changes, guest orders joining an account, and fulfilment or cancellation emails.
- Cookie consent: nothing set needs it (see **Privacy**). If a later tool needs consent, it comes with its own banner.
- Store locator, size guide, services, careers.
- Translations, currencies other than USD (Paystack's naira is `v1.1.0`).

## Modules

| # | Branch | Delivers |
|---|---|---|
| 1 | `docs/m7-launch` | This spec, the plan, and the roadmap changes below. |
| 2 | `feat/monitoring` | Error monitoring and analytics. |
| 3 | `feat/site-pages` | Help and legal pages, the removed links, honest copy. |
| 4 | `feat/seo` | `metadataBase`, canonical URLs, `sitemap.xml`, `robots.txt`, sharing images, titles on not-found pages. |
| 5 | `feat/quality-gates` | axe on every page type, the link check, Lighthouse budgets in CI. |
| 6 | `docs/case-study` | `/about`, its screenshots, and the README. |
| 7 | `docs/milestone-v1.0.0` | Production steps, the exit check on production, budgets, the `v1.0.0` tag and release. |

Monitoring comes first so the legal pages describe the finished setup, and the quality gates come after the new pages so they cover them. The case study is last because its screenshots show the finished site.

## Production (module 7, mostly owner steps)

- **URL:** `https://orra-storefront.vercel.app`. `BETTER_AUTH_URL` and the Stripe webhook already use it.
- **Owner steps, each checked off in the exit check:**
  - Better Auth Infra: set the base URL to the production URL and confirm the dashboard connects.
  - Neon: rotate the production role's password (deferred since M1), then update `DATABASE_URL` in Vercel's Production environment and redeploy.
  - Vercel: confirm Production's environment variables are complete (Stripe test keys, webhook secret, Resend, Blob, `CRON_SECRET`, monitoring), and that previews stay behind the Vercel login.
- **Emails:** Resend's test sender (`onboarding@resend.dev`). The code comments and copy that said "until M7" or "until launch" now just say emails reach only the owner.

## Monitoring and analytics (module 2)

**What was compared** (free tiers, October 2026):

| Option | Free tier | Browser JavaScript (gzip) | Notes |
|---|---|---|---|
| Sentry, Developer plan | 5,000 errors a month, 1 user, 30 days | 58 KB by default, about 29 KB errors-only | `@sentry/nextjs` 11 supports Next 16, Turbopack and Cache Components; source maps upload after the build. v11 collects IP, cookies, headers, bodies and query strings unless told not to. |
| PostHog | 100,000 exceptions and 1M events a month | 52–108 KB | Sets a year-long cookie unless switched to cookieless; its Next 16.3 source-map fixes are weeks old. |
| Better Stack | 100,000 exceptions a month | Same as Sentry (it takes Sentry's SDK) | Free retention and seats unclear. |
| Vercel (Hobby) | Logs for 1 hour, Observability for 12 hours | none | No error grouping or alerts on Hobby. |
| Vercel Web Analytics (Hobby) | 50,000 events a month | about 4 KB | No cookies; custom events need Pro. |
| Vercel Speed Insights (Hobby) | 10,000 events per 30 days | about 7 KB | Hobby shows only the overall score, not LCP, CLS or INP. |

**Decisions:**
- **Errors: Sentry's free Developer plan, from the server only.** **(my call)**
  - `instrumentation.ts` initialises `@sentry/nextjs` for the Node runtime and exports `onRequestError` (Sentry's `captureRequestError`), so server components, route handlers, server actions and the proxy report their errors.
  - **No Sentry code in the browser:** its errors-only SDK alone would add about 29 KB to every page, about ten times what M4 fought to remove. Instead a small reporter of our own (about 1 KB) listens for `error` and `unhandledrejection` and for the error boundaries (`(store)/error.tsx`, `admin/error.tsx`, the root `error.tsx`), and posts a trimmed report (message, stack, page path without its query, release) to `POST /api/client-errors`. That route checks the Origin, caps the size and the rate per IP (on Vercel, through `withinLimit`), and forwards to Sentry from the server with the same scrubbing. The stack is sent as frames, so the source maps uploaded at build can be applied; where they can't, the minified stack is accepted.
  - **What Sentry may receive:** no IP addresses, cookies, headers, request bodies or query strings (each turned off explicitly, since v11 collects them by default); `beforeSend` removes email addresses from messages and the `key` and `token` parameters from any URL. No tracing, no replay, no user identity.
  - **Quota:** 5,000 errors a month. Known noise (browser extensions, aborted fetches, bots) is filtered before sending; once the quota is used, events are dropped until the next month, which is accepted for a demo.
  - **The nightly reset** reports a run with failed steps to Sentry as a message, so a broken reset is seen without reading logs.
  - Optional like Stripe: without `SENTRY_DSN` nothing is sent and nothing fails. `SENTRY_AUTH_TOKEN` (build only) uploads source maps. The DSN stays server-side, so client code still reads no `NEXT_PUBLIC_*` variables.
- **Analytics: Vercel Web Analytics.** Page views with no cookies, about 4 KB. Its `beforeSend` drops the `key` and `token` parameters, so guest order links and reset links never reach it.
- **Speed Insights: not added.** **(my call)** On Hobby it shows only one overall score for 7 KB on every page, while Lighthouse in CI already gates LCP and CLS.
- **The limit:** monitoring and analytics together add at most **6 KB** of JavaScript to a storefront page.

## Site pages (module 3)

**Content as data.** Help and legal pages are typed content in `src/content/` (one file each for help and legal), rendered by one route per section: `/help/[slug]` and `/legal/[slug]`, static, with other slugs answering 404. Each page is a title, a one-line summary and sections of paragraphs and lists, rendered at the prose width with the house type roles. No new components beyond a small `ProsePage`.

| Page | Says |
|---|---|
| `/help/contact` | This is a demo, so there's no customer service. Questions about the build go to the GitHub repository's issues. |
| `/help/delivery` | Complimentary US delivery, estimated 2–4 business days (`DELIVERY_BUSINESS_DAYS`). In the demo nothing ships; orders are test orders. |
| `/help/returns` | The store's 30-day promise as a real store would put it, then: in the demo there's nothing to return; the owner can cancel a test order, which refunds the test payment. |
| `/legal/privacy` | What's stored and why: account name, email and password hash; sessions with IP address and browser; orders with the delivery address typed in; rate-limit counters by IP; saved items and bags. Who processes it: Vercel (hosting, analytics, logs), Neon (database), Stripe (test payments), Resend (email), Better Auth Infra (sign-in events), Sentry (error reports, scrubbed as described above). How long: demo orders, holds and bags 30 days; accounts until deleted from the account page. |
| `/legal/terms` | A demo: nothing is sold, no real money is taken, test cards only, content and photos may change or reset nightly. |
| `/legal/cookies` | Every cookie and browser storage key the site sets, with its purpose and lifetime. All are strictly necessary, so there's no consent banner. |

- **The cookie list is checked:** the cookies page reads its rows from `src/content/cookies.ts`, and a unit test checks every name our code sets (the bag cookies, Better Auth's cookies with the app's prefix) appears there. Stripe's own cookies on `/checkout` are listed as Stripe's.
- **Links:** `site.ts` loses the removed links. The footer's About column becomes "About this project" (`/about`), Stories and Try the admin. The header's utility links lose Find a store; Contact us stays.
- **Copy:** the success page's "…until launch" and the comments promising M7 are rewritten. The services strip's third item changes as decided above.
- **Content checks:** `findContentProblems()` also checks the header and footer links against the routes that exist, so a link to a page that doesn't exist fails a unit test (the e2e link check in module 5 is the final proof).

## SEO (module 4)

- **`metadataBase`:** the production URL (`site.url`) everywhere, so canonical and sharing URLs are absolute and point at production even from a preview (previews sit behind the login, and Vercel already marks them `noindex`).
- **Canonical URLs:** every indexable page sets `alternates.canonical` to its path without a query. Filtered, sorted or paged listings point at the plain listing, and search pages stay `noindex`.
- **`sitemap.xml`** (`src/app/sitemap.ts`): the homepage, Women and Men, every listing and category tab, every live product (archived ones left out), the stories, and the help, legal and about pages. `lastModified` for products is their `updated_at`. One file is enough at this size (the limit is 50,000 URLs).
- **`robots.txt`** (`src/app/robots.ts`): on production, allow everything except `/admin`, `/account`, `/api`, `/bag`, `/checkout`, `/orders`, `/saved`, `/sign-in`, `/sign-up` and `/search`, and point at the sitemap. On any other deployment, disallow everything.
- **Sharing:** the root sets `openGraph` (site name, type, locale) and `twitter.card = "summary_large_image"`. Images as decided above, through the existing `ogImage()` (Unsplash's CDN at 1200 px).
- **Not-found pages get a title** ("Page not found"), carried from M3.
- **Structured data:** products keep their Product JSON-LD. **(my call)** No more is added; Organization and breadcrumb markup would claim things about a business that doesn't exist.

## Quality gates (module 5)

- **Accessibility:** axe (no serious or critical violations) on every page type, adding what isn't covered yet: the homepage, a product page, Women, a story and the stories index, search results, the not-found page, a help page, a legal page and `/about`. Each runs at desktop and mobile, as the suite does.
- **Links (success criterion 3):** an e2e test starts at the homepage, collects every same-site link in the header, footer and main content of each page type, and requests each once: every one answers below 400. It also fails on links into removed routes. It runs in CI against the local build, and against production in the exit check.
- **Lighthouse budgets** in a CI job after the e2e job's build:
  - pages: `/`, `/collections/women`, `/products/leather-tote-tan`;
  - mobile emulation with Lighthouse's default throttling, several runs each, the median asserted;
  - asserted on the median run: LCP, CLS, total JavaScript bytes;
  - Lighthouse CI 0.15 (Lighthouse 12), pinned: its Lighthouse 13 upgrade changes the audits;
  - **(my call)** budgets are fixed in the plan from runs of `main` on CI's runner. Shared runners make timings noisy, so the build fails on what's deterministic and gives timings room:
    - JavaScript bytes: `v0.7.0`'s size plus module 2's 6 KB; fails;
    - CLS under 0.1; fails;
    - LCP: warns above the measured median plus 10%, fails above plus 25%.
  - Reports are kept as a CI artifact, not uploaded publicly.

## Case study (module 6)

- **`/about`** (static, in the storefront frame): what Orra is (a portfolio demo modelled on a luxury fashion storefront), what you can try (shop, pay with a test card, try the admin), then how it was built: the stack and why, the milestones from `docs/milestones.md` in brief, a few decisions worth telling (stock held while paying, capture after the order is safe, the demo admin's masking and nightly reset, Cache Components with immediate admin refresh), how it's tested and shipped (CI, previews per pull request, budgets), and links to the repository and the release notes.
- **Screenshots:** home, a listing, a product page, checkout, the admin, at desktop and phone width, as WebP under `public/case-study/`, through `next/image`. A script (`scripts/case-study-shots.ts`, Playwright against a local build) retakes them.
- **README:** replaces the M1 scaffold text: what it is, the live URL, screenshots, the stack, how to run it locally, the scripts, the process and links to the roadmap, milestones and `CLAUDE.md`.

## Privacy

- No consent banner, because nothing non-essential is stored on the visitor's device: our cookies and storage keys are all for sign-in, the bag, checkout and saved items, and analytics is cookieless (see **Monitoring and analytics**).
- Monitoring must not collect what visitors type: no session replay, no form values, request bodies or cookies sent with errors, and email addresses scrubbed from messages.

## Testing

| Layer | Covers |
|---|---|
| Unit | Content checks over the new pages and the header and footer links; the cookie list against the names in code; sitemap entries (live products only, no private routes); robots per environment; canonical paths without queries; monitoring's scrubbing (emails, `key`, `token`, no IP or cookies); the client-error route (Origin, size, rate limit, forwarding); the analytics URL filter. |
| End-to-end | The new pages render with their titles; removed links are gone; the link check; axe on every page type; `robots.txt` and `sitemap.xml` answer; a browser error is posted to `/api/client-errors` with no query string; no Sentry code in any client chunk (checked against the build output). |
| Lighthouse (CI) | The three pages' budgets. |
| Production (exit check) | The success criteria walked through by hand on production, the e2e suite without `@writes`, the link check, and the owner's purchase with its email. |

## Performance budgets

| Measure | Budget |
|---|---|
| Storefront JavaScript | `v0.7.0` plus at most 6 KB for monitoring and analytics. |
| LCP | No worse than `v0.7.0` on the usual throttled phone runs (home, women, product). |
| Lighthouse in CI | As set in **Quality gates**; a miss fails the build. |
| New pages | Static, with no client JavaScript of their own. |

## Docs and roadmap changes

- **Roadmap:**
  - the M7 row loses the custom domain and the verified sending domain;
  - success criterion 1's email line is rewritten as above;
  - the monitoring vendor open item is settled;
  - email verification, email changes and guest orders joining an account move to an "After launch" list with Paystack.
- **`CLAUDE.md`:** monitoring and analytics, the site pages, SEO files, the quality gates, the case study, and the email wording.
- **`.env.example`:** `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (all optional).

## Risks

- **Lighthouse variance on CI runners** can fail builds for nothing. Mitigation: medians of several runs, budgets with headroom, and simulated throttling (computed, so less noisy than real throttling).
- **Monitoring's cost to every page.** Mitigation: no Sentry code in the browser, and the 6 KB limit, checked by Lighthouse's byte budget.
- **Our own browser reporter** is code to maintain, and it misses errors Sentry's SDK would catch (for example inside third-party frames). Accepted: Stripe's frame reports to Stripe, and the reporter covers our own code.
- **Monitoring quotas.** A burst of errors could use up a free tier's month. Mitigation: sampling and filters set in module 2; losing events after the quota is accepted for a demo.
- **Legal pages that drift from the code.** Mitigation: the cookie list test, and the privacy page naming services rather than describing their internals.

## Left to the plan

- Exact file names beyond those above, and the task order within each module.
- The page copy itself (written in the module, reviewed in its PR).
- The Lighthouse budget numbers, from measured runs.
- The link check's crawl limits (which pages, how many products).
