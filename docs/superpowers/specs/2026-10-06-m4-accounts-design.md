# Orra M4: accounts (design)

- **Date:** 2026-10-06
- **Status:** awaiting review
- **Milestone:** M4 Accounts → `v0.5.0`, as scoped in the [roadmap](2026-10-04-roadmap-to-live-design.md)
- **Scope of this spec:** sign up, sign in and sign out; password reset by email; the account page; saved items stored per account; the auth settings, email sending and preview data handling they need; and their tests. The M4 plan (`docs/superpowers/plans/2026-10-06-m4-accounts.md`) turns it into tasks.
- **Not in this spec:** the server-side bag, checkout and orders (M5), admin roles (M6), a verified email domain (M7).

## Intent

**What M4 is for:** shoppers can have an account, and what they save follows them.
- A visitor can create an account, sign in and out, and reset a forgotten password.
- Signed in, saved items live in the account, so they appear on every device. Items saved before signing in move into the account.
- The account page lets people manage their profile, password, devices and the account itself.
- Signed out, nothing changes: saving works in the browser as it does today, and every page stays as fast and as cached as in `v0.4.0`.

**Decisions made while brainstorming:**

| Question | Decision |
|---|---|
| Email sending domain (roadmap open item) | **No domain yet.** Resend's test sender, which only delivers to the owner's address, until M7 adds a domain. So email verification isn't required at sign-up, and password reset is built and tested but only reaches the owner until then. |
| Ways to sign in | **Email and password only.** No Google, passkeys or Apple in M4. |
| Where saved items live | **A `/saved` page for everyone**, like Gucci's "My Saved Items": signed out it shows this browser's list with a prompt to sign in; signed in, the account's list. The account page links to it. |
| What the account page does | **All of:** edit name, change password, list and sign out devices, delete the account. Changing the email waits for M7's domain (it needs a confirmation email). |
| Sign-in layout | **Two pages** (changed on 2026-10-08 at the user's request, from "one page, like Gucci"): `/sign-in` and `/sign-up`, each a single centred column that links to the other. Gucci stays the reference for style; sign-up is one step instead of Gucci's email-first two steps. |
| Account data on previews (carried from M3) | **Cleared.** Each preview's Neon branch is copied from production, so the preview build deletes every account right after migrating. Previews start with no accounts. |
| Session state and saved items | **The session is read in the browser; saved items go through a small API.** Pages stay static and cached. Signed in, saved items come from a private endpoint and change through server actions with optimistic updates (TanStack Query). TanStack DB was considered and left for M5's bag and M6's admin, where several views share the same rows. Reading the session on the server for every page was rejected: it would make every page partly dynamic and give up M3's caching. |

The design was presented in five sections, and the user approved each one: modules; auth foundation; pages and UI; saved items data; testing, errors, security and performance. The UI follows Gucci UK's sign-in, password reset and saved items patterns, which were researched in the browser first.

**Assumptions** (stated to the user and not contradicted): Better Auth stays, with its existing email and password support; the bag stays in the browser until M5.

## Exit criteria (from the roadmap)

1. A signed-in user's saved items appear on another device.
2. Signed-out behaviour is unchanged.
3. Sign up, sign in, sign out and password reset work on production (reset delivers to the owner's address until M7).
4. The account page's actions work, and a deleted account can't sign in and leaves no saved items behind.

## Out of scope

- Social sign-in, passkeys, magic links, two-factor authentication.
- Required email verification, and changing the account email (both need a sending domain).
- Server-side bag, orders, addresses and payment methods (M5).
- Roles and admin (M6).

## Auth foundation (module 2)

Settings live in `src/lib/auth.options.ts`, so `npm run auth:generate` sees every table they need.

| Setting | Value |
|---|---|
| Password length | 8 to 128 characters. |
| Session length | 30 days. With "Stay signed in" off, the cookie lasts until the browser closes (Better Auth's `rememberMe: false`). |
| Session cookie cache | On, 5 minutes, signed. Session reads from the browser skip the database while it holds. So a session revoked elsewhere (a device signed out from the account page, a password change or a reset) is still accepted by those reads for up to 5 minutes, and that browser can show itself as signed in until then. Server-side checks skip the cache (see the data access layer), so a revoked session can't use `/account`, server actions or `/api/saved`. Signing out on the device itself clears the cookies at once. |
| Password reset | Tokens expire after 1 hour. A reset revokes every session; other devices' browser reads may still show them signed in for up to 5 minutes (cookie cache above). |
| Account deletion | On; it needs the current password. |
| Email verification | Not required (no sending domain yet). |

**Rate limits.** In-memory limits do nothing on serverless, so they're stored in the database (`auth:generate` adds a `rateLimit` table). They're on for Vercel production and previews and off locally and in CI, where parallel tests come from one IP.

| Action | Limit per IP |
|---|---|
| Sign in | 5 a minute |
| Sign up | 3 a minute |
| Password reset request | 3 every 15 minutes |
| Everything else | Better Auth's default |

**URLs per environment.** Production and local development keep `BETTER_AUTH_URL` as today. On previews, `src/lib/env.ts` derives the auth base URL from `VERCEL_URL` and trusts `VERCEL_BRANCH_URL` too, because previews currently point `BETTER_AUTH_URL` at production, which would break sign-in there. The browser auth client calls its own origin, so it no longer reads `NEXT_PUBLIC_APP_URL`.

**Email** (`src/lib/email/`, server-only).
- `sendEmail()` sends through Resend when `RESEND_API_KEY` is set, from Resend's test sender, so until M7 it only delivers to the owner's address.
- Without the key it logs the email instead. When `EMAIL_OUTBOX_DIR` is set (local runs and CI, never on Vercel), it also writes each email to a file there, so end-to-end tests can read reset links.
- The reset email is plain HTML plus text in house style.
- A failed send is logged, never shown. The reset request always answers "If an account exists for that email, we've sent a link".

**Previews start with no accounts.** After migrating and seeding, the preview build runs `scripts/clear-accounts.ts`. It deletes verification tokens, sessions, accounts, users (their saved items go with them) and rate-limit rows. It uses the seed's production-host guard, so it refuses production, and the build-steps tests pin that it runs only on previews.

**Server-side session** (`src/lib/auth/session.ts`, the data access layer).
- `getCurrentUser()` reads the session from the request headers, skipping the cookie cache so revoked sessions are refused at once, and returns `{ id, name, email }` or nothing. That's one database read per server-side check, which only `/account`, actions and route handlers make.
- `requireUser(returnTo)` sends anyone without a session to `/sign-in?returnTo=…`.
- Only `/account` pages (inside `<Suspense>`), server actions and route handlers use them. Every action and handler checks the session itself.

**`src/proxy.ts`.** For `/account/*`, a check for the session cookie redirects to sign-in before rendering. It's a convenience only; pages and actions still verify the session.

**Env.** `RESEND_API_KEY` and `EMAIL_OUTBOX_DIR` are optional. The user adds `RESEND_API_KEY` to Vercel (production and preview) and to `.env.local`.

## Pages and UI (modules 3 and 4)

Monochrome, using the design system's tokens and primitives, with forms in TanStack Form and shadcn `Field` on Base UI. Inputs are underlined, buttons full-width and black, as on Gucci UK.

### `/sign-in` and `/sign-up`

Two pages, each a single centred column (the prose width), that link to each other and keep `?returnTo`.
- **`/sign-in`:**
  - the heading and one line ("Welcome back…");
  - underlined Email and Password, with a show/hide control on the password;
  - "Stay signed in", on by default, and "Forgot your password?";
  - a full-width Sign in button;
  - then "New to Orra?" with a line on the benefits and an outlined "Create an account".
  - A wrong email or password shows one message: "That email and password don't match."
- **`/sign-up`:**
  - the heading and the benefits that exist today: saved items on every device, and managing the account (M5 adds orders);
  - Name, Email and Password ("At least 8 characters") and Create account, in one step;
  - then "Already have an account?" with an outlined "Sign in".
  - If the email already has an account, it says so and offers "Sign in instead", which carries the email to `/sign-in` for this tab (session storage, never the URL). That reveals the email is registered, which is standard, and sign-up is rate-limited.
- **Behaviour:**
  - Zod checks each field; errors sit with their fields, and form errors are announced.
  - Buttons read "Signing in…" and "Creating account…" while submitting.
  - Afterwards the visitor goes to `?returnTo` when it's a path on this site, otherwise to `/account`. A path must start with a single `/` and never points back to `/sign-in` or `/sign-up`.
  - A signed-in visitor opening either page goes straight on.

### Password reset

- **`/sign-in/forgot-password`:**
  - a Back link, the heading, one sentence, Email and Continue;
  - then the neutral confirmation, with "Back to sign in".
- **`/sign-in/reset-password?token=…`:**
  - a new password, with show/hide, and "Change password";
  - on success: "Your password has been changed. Sign in with your new password."
  - A bad or expired link says so and links to request a new one.

### Header account menu

- The account icon opens a small menu:
  - **signed out:** Sign in, Saved items;
  - **signed in:** "Hello, Name", My account, Saved items, Sign out.
- The icon looks the same in both states, so nothing shifts while the session loads.
- The phone menu's account links switch the same way.
- Sign out goes to the homepage.

### `/account`

Protected; the content streams under `<Suspense>` with a skeleton.
- **Overview:** "Hello, Name"; a saved items summary (count and a link to `/saved`); Orders ("Your orders will appear here", until M5).
- **Profile:** the name is editable inline. The email is shown, with a note that changing it comes later.
- **Password:** current and new password, with "Sign out of other devices" checked by default.
- **Signed-in devices:**
  - each with its browser and system (from the user agent), when it was last active, and "This device";
  - a Sign out button on each, and "Sign out of all other devices".
- **Delete account:** a confirmation dialog asks for the password. Afterwards: the homepage, signed out, with "Your account has been deleted".
- **Confirmations** are inline next to each action ("Name updated.") in a polite live region.

### `/saved`

- "Saved items (n)", then the product grid with a remove control on each card.
- **Signed out:** this browser's list, with "Sign in to keep your saved items on every device".
- **Empty:** "You haven't saved anything yet" and a link to New in.

### Everywhere

- `/sign-in`, `/sign-up`, `/account` and `/saved` pages are `noindex`.
- Browser-checked at 375, 1024, 1280 and 1440 px.

## Saved items (module 5)

### Data

`saved_items` in `src/db/schema/saved.ts`:

| Column | Notes |
|---|---|
| `user_id` | References `user.id`; deleting the user deletes its rows. |
| `product_id` | References `products.id`; deleting the product deletes its rows. |
| `created_at` | Defaults to now. |

The primary key is the user and product pair, with an index on `(user_id, created_at desc)`. An account can hold up to 200 saved items; the actions enforce the cap.
- **Saving one item** on a full account removes the oldest, so the newest 200 stay.
- **A merge never removes account items.** It adds browser items only while there's room. Items that don't fit are returned as not merged and stay in the browser's list for a later sync; the merge itself still succeeds.

### Reads and endpoints

- `src/lib/saved/queries.ts` (server-only, not cached because they're per user):
  - `getSavedSlugs(userId)`, newest first;
  - `getProductSummaries(slugs)`, M3's card shape, in the order asked.
- **`GET /api/saved`:** `{ slugs }` for the signed-in user, `401` otherwise, with `Cache-Control: private, no-store`.
- **`GET /api/products/summaries?slug=…`:** public and cacheable, keys sorted, at most 200. The `/saved` page uses it for both the browser's list and the account's.

### Server actions

`src/lib/saved/actions.ts`: `saveItem(slug)`, `unsaveItem(slug)` and `mergeSaved(slugs)`.
- Zod validates every input (slug format, at most 200), and each action checks the session.
- Slugs are looked up to product ids; unknown ones are skipped. Inserts ignore duplicates.
- Each returns the updated list as a typed result.

### Client

**`useSaved()`** (`src/lib/saved/use-saved.ts`) is the one hook for product pages, the account menu and `/saved`.
- **Signed out:** the browser store's `saved` list, as today.
- **Signed in:** `["saved", userId]` from `/api/saved`. A toggle updates the list at once, rolls back if the action fails, then re-syncs.
- It exposes `slugs`, `isSaved(slug)`, `toggle(slug)` and `status`. While the session or list loads, Save buttons show the browser's state and stay usable.

**Merge on sign-in.** `SavedSync`, mounted in the app's providers, notices when a session appears while this browser still holds saved items. That covers sign-in, sign-up and another tab signing in. It calls `mergeSaved` once with the browser's newest 200 valid slugs (the request limit, so a longer list is never rejected) and, on success, removes from the browser's list the items that were sent and merged (or no longer exist). Items that didn't fit in the account, and any beyond the first 200, stay for a later sync. If the merge fails, the list stays and it tries again on the next load.

**Signing out** doesn't copy the account's items into the browser, which keeps them private on a shared computer.

**Product page.** Save for later in `PurchaseActions` switches from the bag store to `useSaved()`. The bag stays in the browser until M5.

## Errors and security

- **Errors:**
  - One module maps Better Auth's error codes to plain messages. Network failures say "Something went wrong. Try again."
  - Server actions return typed results instead of throwing, so forms always show something inline.
  - A session that expires mid-visit sends account actions to sign-in with `returnTo`.
- **Security:**
  - Better Auth checks request origins, including the trusted preview hosts, and Next checks server-action origins.
  - Session cookies are HttpOnly, Secure and SameSite=Lax.
  - `returnTo` only allows paths on this site.
  - Passwords are never logged; reset links are logged only outside production.
  - Deleting the account needs the password. Changing the password signs other devices out by default; their browser reads may show them signed in for up to 5 minutes (the cookie cache), but server-side checks refuse them at once.
  - Sign-up is the only place that reveals an email has an account, and it's rate-limited.

## Modules

| # | Branch | Delivers |
|---|---|---|
| 1 | `docs/m4-accounts` | This spec, the plan, the roadmap's email-domain item settled, the GitHub milestone. |
| 2 | `feat/auth-foundation` | Better Auth settings and `rateLimit` table, preview auth URLs, email module, clearing accounts on previews, `getCurrentUser`/`requireUser`, `proxy.ts`. No visible change. |
| 3 | `feat/auth-pages` | `/sign-in`, forgot and reset password, sign out, the header account menu, safe `returnTo`. |
| 4 | `feat/account-page` | `/account`: profile, password, devices, delete account, saved and orders summaries. |
| 5 | `feat/saved-items` | `saved_items`, `/api/saved`, `/api/products/summaries`, actions, `useSaved`, `SavedSync`, `/saved`, the product page's Save button. |
| 6 | `docs/milestone-v0.5.0` | The milestone entry, then the tag and the release. |

New dependency: `resend` (module 2). Each module is one pull request in the GitHub milestone "M4 · Accounts".

## Testing

| Layer | Covers |
|---|---|
| Unit (Vitest) | The `returnTo` sanitiser (`//evil.com`, absolute URLs, `/sign-in` loops); the auth URL per environment; user-agent labels; the form schemas; email templates; build steps (account clearing only on previews, refusing production). |
| Database (PGlite, real migrations) | Better Auth against PGlite: sign up, sign in, password rules, the reset flow end to end with the outbox, a reset signing out every device. Deleting an account removes its saved items. Saved reads and actions with a test user: duplicates, unknown slugs, the 200 cap, merge order, a merge that doesn't fit. Clearing accounts removes every auth row and leaves the catalogue. The migration replay covers the new tables. |
| End-to-end (Playwright, desktop and mobile) | Sign up, sign out, sign in back to the starting page; a wrong password; forgot and reset password through the file outbox; the account page (rename, change password, devices across two browser contexts, delete); saved items across two contexts and the merge on sign-in; the menu in both states; axe on `/sign-in`, `/account` and `/saved`. Each test signs up a fresh `…@example.test` user and deletes it at the end. |

**Production exit check.** Tests that write accounts are tagged `@writes` and skipped against production, apart from one sign-up-then-delete smoke test, so the check doesn't fill production with test users or trip the rate limits.

## Performance budgets

Measured on production at the end of the milestone, as in M3:

| Measure | Budget |
|---|---|
| Listing and product page LCP | No worse than `v0.4.0` (pages stay as cached) |
| `/api/saved` and `/api/products/summaries` server time | < 50 ms |
| The header's session check | No database read while the 5-minute cookie cache holds |

## Docs and roadmap changes

- **`CLAUDE.md`:** the auth settings and data access layer, email and the outbox, clearing accounts on previews, saved items and `useSaved`, and the `@writes` tag.
- **`.env.example`:** `RESEND_API_KEY` and `EMAIL_OUTBOX_DIR`.
- **Roadmap:** the email-domain item is settled (Resend's test sender until M7 adds a domain), and the carried-forward question on preview account data is settled (cleared).

## Risks

- **Rate limits and shared IPs.** Visitors behind one office IP share a limit. The limits are generous for people and only bite on scripted abuse.
- **Session flicker.** Signed-in state appears a moment after load. The account icon doesn't change shape, and Save buttons work in the browser's state until the account list arrives.
- **Better Auth on PGlite.** The database tests depend on the Drizzle adapter working against PGlite. If it doesn't, those tests run the same flows through the HTTP handler against a throwaway Neon branch instead.
- **Resend's test sender.** Until M7, visitors other than the owner can't receive reset emails. The confirmation stays neutral, and the limitation is recorded in the milestone entry.

## Left to the plan

- The exact Better Auth error codes to map, and the copy for each.
- How the user-agent label is produced (a small parser or a dependency, justified in the plan).
- The order of tasks inside each module, with tests first.
