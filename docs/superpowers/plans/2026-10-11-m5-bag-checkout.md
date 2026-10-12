# M5 Bag & Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shopper can fill a server-side bag, check out on Orra's own page with the stock held while they pay, and receive an order, a confirmation email and order history, while every other page stays as fast and cached as in `v0.5.0`.

**Architecture:**
- **Bag:** Postgres (`carts`, `cart_items`), changed by single-statement server actions; a signed guest cookie; a readable count cookie for the header; `GET /api/bag` with TanStack Query optimistic updates.
- **Checkout:** a stock hold per checkout (`checkouts`, `checkout_items`) taken in a transaction on Neon's WebSocket pool; a Stripe Checkout Session in `elements` UI mode with manual capture, behind a provider-neutral payment interface.
- **Orders:** one idempotent `fulfil` called by the webhook and the success page; capture after the order is committed, or cancel the authorisation when the stock is gone.

**Tech Stack:** Next.js 16.3 (Cache Components), Better Auth 1.7.7, Drizzle on Neon (HTTP for reads and single statements, WebSocket `Pool` for transactions; PGlite in tests), TanStack Query 5 and Form 1, shadcn on Base UI, Stripe (`stripe@23`, `@stripe/stripe-js@10`, `@stripe/react-stripe-js@7`), Resend, Vitest, Playwright with axe.

**Spec:** `docs/superpowers/specs/2026-10-11-m5-bag-checkout-design.md`

## Global Constraints

- **Process (as in M1–M4):**
  - npm only. One module = one branch = one PR, assigned to the GitHub Milestone `M5 · Bag & checkout`, with the PR template completed.
  - The user approves by squash-merging; never merge. Every `git push` needs the user's approval.
  - Stage files by path; never `git add -A`. No attribution anywhere (no Co-Authored-By, no "Generated with").
  - Run a fresh-context review subagent (opus) over each branch before its PR. Fix Critical and Important findings, and record the minors in `.superpowers/sdd/2026-10-11-m5-bag-checkout/progress.md`.
  - After `gh pr create`, call ccd_pr `get_status` once. Never poll CI.
- **Production safety:**
  - Never read `.env` or `.env.local`; worktrees symlink both. The user adds every Stripe key.
  - Before any local `db:migrate`, `npm run db:seed -- --check` must print `not production`.
  - Local database, build and e2e runs use `NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"`.
  - Generate migrations with `npm run db:generate -- --name <name>`; hand-edit only where noted.
- **Dependencies:** `stripe@23` (server), `@stripe/stripe-js@10` and `@stripe/react-stripe-js@7` (client, loaded only on `/checkout`); the `Pool` client comes from the already-installed `@neondatabase/serverless`. Exact versions, latest stable at install, checked for maintenance and size first. Nothing else new without asking.
- **Values (from the spec):**

  | Name | Value |
  |---|---|
  | `MAX_QUANTITY` | 10 per item, and never above live stock |
  | `BAG_LINE_LIMIT` | 50 lines |
  | Guest cookie | `__Host-orra_cart` (`orra_cart` when not on HTTPS locally), `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 30 days sliding |
  | Count cookie | `orra_bag_count`, readable, `SameSite=Lax`, 0–999, same lifetime |
  | Hold length | 31 minutes (Stripe's minimum session life is 30) |
  | Checkout rate limit | 5 starts per IP per 10 minutes |
  | Stripe API version | `2026-09-30.endive` (pinned) |
  | Order numbers | `ORR-` + a sequence starting at 10001 |

- **Copy:** fixed by the spec. In particular:
  - "Only 2 left — we've updated your bag"
  - "Leather tote removed. Undo"
  - "Your bag is empty"
  - "No taxes are charged in this demo"
  - "Payments run in Stripe test mode — no real money"
  - "Demo store — pay with the test card 4242 4242 4242 4242, any future date, any CVC"
  - "Only 1 Leather tote was left — your bag has been updated"
  - "We're holding your items until 3:45 pm"
  - "Thank you — order ORR-10001 is confirmed"
  - "Sorry — the Leather tote sold out while you were paying. Your card was not charged."
- **UI:**
  - Use the existing tokens, primitives and type roles. Forms use TanStack Form plus shadcn `Field`; use the Base UI `render` prop, not `asChild`. Links styled as buttons use `cn(buttonVariants(…))`.
  - Browser-check at 375, 1024, 1280 and 1440 px with no overflow and no console errors other than known 404 prefetches.
  - `/bag`, `/checkout`, `/checkout/success`, `/account/orders*` and `/orders/*` are `noindex`.
  - Nothing new loads on pages that don't need it: the panel reuses the loaded `Sheet`; Stripe loads only on `/checkout`.
- **e2e:**
  - Follow the conventions in `CLAUDE.md` (`gotoHydrated`, no `load` waits).
  - Tests that create accounts or orders are tagged `@writes`. Checkout tests that need Stripe skip unless `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are set.

## Review Focus

1. **The last unit:** two `startCheckout` calls at once for a product with stock 1. Expected: one hold, one "sold out" answer, stock 0 and never negative. *Pinned in Task 11.*
2. **A lapsed hold:** the hold expires and the unit sells to someone else, then the first payment completes. Expected: no order, the checkout `cancelled`, the authorisation cancelled (`undo`), the success page's sold-out message. If the stock is still there, the order goes through. *Pinned in Task 13.*
3. **Duplicate fulfilment:** the webhook and the success page call `fulfil` at the same moment; Stripe resends an event. Expected: exactly one order, one capture, one email. *Pinned in Tasks 13–16.*
4. **Tampering:** a client sends a price, a forged cart cookie, another shopper's checkout id, an unsigned webhook, or an authorised amount that differs from the hold. Expected: prices come from the database; forged cookies start a fresh bag; other shoppers' checkouts and orders reveal nothing; unsigned webhooks get 400; a mismatch is undone and logged. *Pinned in Tasks 3, 13, 14, 15.*
5. **The bag across sign-in:** a guest bag and an account bag that both hold the same product; a bag at 50 lines; quantities above stock; two tabs. Expected: summed and capped, never above 50 lines or stock, the guest cart deleted, and the count right after the reload. *Pinned in Task 5.*
6. **The count cookie drifting** (another device changed the account's bag). Expected: the header catches up the next time the bag is read; it never shows a negative or absurd number. *Pinned in Task 6.*

---

## Module 1: `docs/m5-bag-checkout`

### Task 1: Spec, plan, roadmap and the GitHub milestone

- [ ] **Step 1:** The spec is already committed on this branch. Add this plan.
- [ ] **Step 2: Roadmap.** In `docs/superpowers/specs/2026-10-04-roadmap-to-live-design.md`:
  - M5's table: checkout on Orra's own page (Stripe `elements` UI mode, Payment Element), stock held during checkout, manual capture; M5's exit as in the M5 spec.
  - The M5 data line: `checkouts`, `checkout_items`, `payment_events`; orders store `payment_provider` and `payment_reference` instead of `stripe_session_id`.
  - Settle the risk "Stripe webhooks on previews": previews finish orders on the success page; production has the webhook.
  - Add **Paystack → `v1.1.0`** after M7: a Paystack provider behind the payment interface and its popup, naira prices, Nigerian delivery addresses, the provider chosen by currency.
- [ ] **Step 3: GitHub milestone.** Run `gh api repos/Earnstein/orra-storefront/milestones -f title="M5 · Bag & checkout" -f description="Server-side bag, checkout and orders → v0.6.0"`.
- [ ] **Step 4:** Commit `M5 Bag & checkout spec and plan`, push (approval), open the PR in the milestone, and wait for the merge.

## Module 2: `feat/server-bag`

### Task 2: Cart tables, limits and the narrowed search trigger

**Files:**
- Create: `src/db/schema/cart.ts` (re-exported from the barrel; relations in `relations.ts`); `drizzle/0007_server_bag.sql` (generated, then the trigger change appended by hand); `src/lib/bag/limits.ts` (client-safe).
- Test: `src/db/schema/cart.test.ts` (PGlite), `src/db/migrations.test.ts`, `src/lib/catalog/search-trigger.test.ts`.

**Interfaces:**
- Produces:
  - `carts`: `id` uuid default `gen_random_uuid()`; `userId` text unique nullable → `user.id` cascade; `createdAt`, `updatedAt`.
  - `cartItems`: `cartId` uuid → `carts.id` cascade; `productId` integer → `products.id` cascade; `quantity` integer, check `> 0`; `addedAt`. Primary key `(cartId, productId)`.
  - `MAX_QUANTITY = 10`, `BAG_LINE_LIMIT = 50`, and `isSlug` reused from `src/lib/saved/limits.ts`.

- [ ] **Step 1: Write the failing tests:**
  - deleting a user deletes their cart and its items; deleting a product deletes its items;
  - `quantity = 0` is rejected; two carts can't share a `user_id`; any number of guest carts have `user_id` null;
  - **search trigger:** updating only `stock` leaves `search` and `search_text` unchanged (compare before and after, and the trigger isn't called: `updated_at`-independent check via a column snapshot); updating `name` changes them; renaming a category still re-saves its products;
  - the migration replay includes the new tables.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement**
  - Generate with `npm run db:generate -- --name server_bag`. Append: `DROP TRIGGER "products_search_refresh" ON "products"; CREATE TRIGGER "products_search_refresh" BEFORE INSERT OR UPDATE OF "name", "description", "colour", "colour_family", "material", "category_id", "details" ON "products" FOR EACH ROW EXECUTE FUNCTION "products_search_refresh"();`
  - Run `npm run db:seed -- --check` (must print `not production`), then `npm run db:migrate`.
- [ ] **Step 4:** Run `npm test`. Expected: green. Commit `Add the cart tables and stop stock updates rebuilding the search index`.

### Task 3: Bag cookies and finding the shopper's cart

**Files:**
- Create: `src/lib/bag/cookies.ts` (server-only: sign and verify the cart id, read and write both cookies); `src/lib/bag/cart.ts` (server-only: resolve or create the cart for a request).
- Test: `src/lib/bag/cookies.test.ts`, `src/lib/bag/cart.test.ts` (PGlite).

**Interfaces:**
- Produces:
  - `signCartId(id: string, secret: string): string` and `verifyCartCookie(value: string | undefined, secret: string): string | null` (HMAC-SHA256 with the label `orra:cart:v1`, constant-time compare);
  - `cartCookieOptions(secure: boolean)` and `countCookieOptions(secure: boolean)` (the names and flags in Global Constraints; the `__Host-` prefix only when secure);
  - `findCart(db, { userId, guestCartId }): Promise<{ id: string } | null>` and `ensureCart(db, { userId, guestCartId }): Promise<{ id: string; created: boolean }>` (a signed-in shopper always uses their own cart, created on first need with `INSERT … ON CONFLICT (user_id) DO NOTHING RETURNING` then a read);
  - `setBagCookies({ cartId?, count })` for actions and route handlers (uses `cookies()` from `next/headers`).

- [ ] **Step 1: Write the failing tests** (Review Focus 4):
  - a signed id verifies; a changed id, a changed signature, an empty value and a value signed with another secret don't;
  - `ensureCart` for a guest creates one cart and returns `created: true`, then the same cart for the same cookie;
  - `ensureCart` for a user creates one cart even when called twice at once (`Promise.all`);
  - a guest cookie pointing at a cart that belongs to a user is ignored (a fresh guest cart is made).
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement** with Node's `crypto` (`createHmac`, `timingSafeEqual`), keyed from `BETTER_AUTH_SECRET`. Cookies are only written from actions and route handlers.
- [ ] **Step 4:** Run `npm test`. Expected: green. Commit `Add the signed guest bag cookie and cart lookup`.

### Task 4: Bag reads, actions and `GET /api/bag`

**Files:**
- Create: `src/lib/bag/queries.ts` and `src/lib/bag/mutations.ts` (server-only, testable without Next); `src/lib/bag/actions.ts` (`"use server"`); `src/app/api/bag/route.ts`; `src/lib/bag/types.ts` (client-safe `Bag`, `BagLine`).
- Test: `src/lib/bag/mutations.test.ts`, `src/lib/bag/queries.test.ts`, `src/app/api/bag/route.test.ts`, `src/lib/bag/actions.test.ts`.

**Interfaces:**
- Produces:
  - `type BagLine = { slug; name; colour; unitPrice; image; stock; quantity; note: "reduced" | "sold-out" | null }`; `type Bag = { lines: BagLine[]; count: number; subtotal: number; currency: "USD" }` (`count` and `subtotal` leave sold-out lines out);
  - `readBag(db, cartId): Promise<Bag>`: live stock; a line above stock is lowered in the database in the same request (one `UPDATE … FROM products`) and marked `reduced`; a line with stock 0 stays and is marked `sold-out`;
  - mutations, each one statement and returning `{ bag, capped }`: `addLine(db, cartId, slug, quantity)` (`INSERT … SELECT … FROM products WHERE slug = $slug AND stock > 0 ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, (SELECT stock FROM products WHERE id = EXCLUDED.product_id), 10)`: the conflict update reads stock through a scalar subquery keyed by `EXCLUDED.product_id`, since it can't reference the `SELECT`'s `products`; refuses a new line past 50), `setLineQuantity`, `removeLine`;
  - actions `addToBag(slug, quantity = 1)`, `setQuantity(slug, quantity)`, `removeFromBag(slug)`, `moveToSaved(slug)` → `Promise<ActionResult<{ bag: Bag; capped: boolean }>>` (Zod: `isSlug`, quantity 1–10); each sets the count cookie, and `addToBag` creates the guest cookie when needed;
  - `GET /api/bag` → `Bag`, `Cache-Control: private, no-store`, `Server-Timing: db;dur=…`; sets the count cookie.

- [ ] **Step 1: Write the failing tests:**
  - add to an empty bag; add again sums; past stock caps and reports `capped`; past 10 caps; the 51st distinct line is refused (`invalid`);
  - ten concurrent `addLine` calls for a product with stock 3 end at quantity 3 (Review Focus 4's cap side);
  - unknown slug → `invalid`; sold-out product → not added, `capped`;
  - `readBag` lowers a line when stock fell and marks it `reduced`; a stock-0 line is `sold-out` and excluded from `count` and `subtotal`;
  - `moveToSaved` signed in saves to the account and removes the line; signed out it removes the line and returns `{ saveLocally: slug }`;
  - `GET /api/bag` with no cookie → an empty bag and no cart created; with a forged cookie → empty; headers `private, no-store`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** Prices and names always come from `products`; the client never sends a price.
- [ ] **Step 4:** Run `npm test`. Expected: green. Commit `Add bag actions and the bag endpoint`.

### Task 5: Merging on sign-in and moving browser bags

**Files:**
- Create: `src/lib/bag/merge.ts` (server-only); `src/components/bag/bag-import.tsx`.
- Modify: `src/lib/auth.ts` (an after-hook); `src/test/auth.ts` (accept the hook like the reset sender); `src/lib/bag/actions.ts` (`importLines`); `src/components/providers.tsx` (mount `BagImport`); `src/lib/bag/rules.ts` and `store.ts` (drop `lines` after import).
- Test: `src/lib/bag/merge.test.ts`, `src/lib/auth.test.ts`, `e2e/bag.spec.ts`.

**Interfaces:**
- Produces:
  - `mergeGuestCart(db, { guestCartId, userId }): Promise<{ count: number }>`: one statement inserts the guest lines into the user's cart (`ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, (SELECT stock FROM products WHERE id = EXCLUDED.product_id), 10)`, skipping lines that would pass 50), then deletes the guest cart;
  - `bagMergeHook` (a Better Auth `hooks.after` middleware) for `/sign-in/email` and `/sign-up/email` that reads the guest cookie from the request, merges into the new session's user, and clears the guest cookie and sets the count cookie on the response;
  - `importLines(lines: { slug: string; quantity: number }[])` (at most 50) → `ActionResult<{ count: number }>`.

- [ ] **Step 1: Write the failing tests** (Review Focus 5):
  - the same product in both bags sums and caps at stock and 10; a 50-line account takes no new lines from the guest; the guest cart is gone afterwards; merging twice does nothing more;
  - through `createTestAuth` with the hook: sign in with a guest cookie → the user's cart holds the lines and the response clears the guest cookie and sets `orra_bag_count`; a failed sign-in changes nothing;
  - `importLines` ignores unknown slugs and caps quantities;
  - **e2e (`@writes`):** as a guest add two products, sign up; `/bag` (via `/api/bag`) shows both and the header count is 2. A browser with `orra:bag:v1` lines from before M5 sees them in the bag after one load, and `lines` is gone from local storage while `saved` stays.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** The hook is passed from `auth.ts` (server-only) into the options, like `resetPasswordSender`, so the CLI config never imports the database. `BagImport` runs once per load and only when local `lines` exist.
- [ ] **Step 4:** Run the full verification. Expected: green. Commit `Merge the guest bag on sign-in and move browser bags to the server`.

### Task 6: `useBag`, the count and the header

**Files:**
- Create: `src/lib/bag/use-bag.ts`; `src/lib/bag/use-bag-count.ts`.
- Modify: `src/components/site/bag-link.tsx`; `src/lib/auth/signed-out-marker.ts` or `use-account.ts` (clear the count cookie on sign-out).
- Test: `src/lib/bag/use-bag-count.test.ts` (the cookie parser), `e2e/bag.spec.ts`.

**Interfaces:**
- Produces:
  - `useBag(): { bag: Bag | undefined; status: "loading" | "ready" | "failed"; add(slug, quantity?): Promise<{ capped: boolean; line: BagLine }>; setQuantity; remove; moveToSaved; retry }`, query `["bag"]`, optimistic with rollback, one mutation scope (`bag`), re-read after the last settles;
  - `useBagCount(): number` from `orra_bag_count` via `useSyncExternalStore`, re-read on `visibilitychange` and after `useBag` mutations; `parseBagCount(cookieHeader): number` clamps to 0–999 and treats anything else as 0.

- [ ] **Step 1: Write the failing tests** (Review Focus 6):
  - `parseBagCount` reads the number, ignores other cookies, and returns 0 for `-1`, `abc` and `1e9`;
  - **e2e:** adding updates the header count without a reload; reloading any page shows the same count without a request to `/api/bag` (`page.on("request")` sees none); signing out shows 0.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** `BagLink` reads `useBagCount()` ("Bag, 2 items"; "Bag" at 0). The browser store keeps only `saved`.
- [ ] **Step 4: Verify and open the PR**
  - Run the full verification, plus the bundle-size check from M4 (product page and listing JS against `v0.5.0`; no growth beyond a few KB).
  - Update `CLAUDE.md` (bag data, cookies, actions, merge, import, `useBag`).
  - Run the review, push (approval) and open the PR `Move the bag to the server`. Wait for the merge.

## Module 3: `feat/bag-page`

### Task 7: `/bag`

**Files:**
- Create: `src/app/bag/page.tsx`; `src/components/bag/bag-view.tsx`, `bag-line.tsx`, `order-summary.tsx`, `empty-bag.tsx`.
- Test: `e2e/bag.spec.ts`, `e2e/a11y.spec.ts`.

- [ ] **Step 1: Write the failing e2e tests:**
  - lines show photo, name, colour, unit price, quantity and line total; the summary's subtotal and total match;
  - changing the quantity select updates the totals and the header count;
  - Remove leaves "… removed. Undo" with focus on Undo; Undo restores the line and quantity;
  - Move to saved items removes the line and the product shows Saved;
  - a line above stock (set in the database by the test) shows "Only 2 left — we've updated your bag"; a stock-0 line shows Sold out and isn't in the total; Checkout is disabled when every line is sold out;
  - the empty bag shows "Your bag is empty" and New in, Women and Men links;
  - axe: `/bag` full and empty have no serious or critical violations.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement** to the spec's layout (two-thirds and one-third from `lg`; the phones' Checkout button under the heading). Metadata `noindex`, title "Shopping bag".
- [ ] **Step 4:** Run them. Expected: green. Browser-check at the four widths. Commit `Add the bag page`.

### Task 8: The added-to-bag panel and the product page

**Files:**
- Create: `src/components/bag/added-panel.tsx`.
- Modify: `src/components/product/purchase-actions.tsx`.
- Test: `e2e/bag.spec.ts`, `e2e/a11y.spec.ts`.

- [ ] **Step 1: Write the failing e2e tests:**
  - Add to bag shows "Adding…", then the panel with the item and the quantity in the bag; Checkout goes to `/checkout`, View bag to `/bag`; Escape closes it and focus returns to Add to bag;
  - at the stock cap the panel says "You have all 2 available in your bag" and the button reads "All available in your bag";
  - when the page's cached stock is higher than live stock (set in the database), the panel says "Only 1 was left — it's in your bag";
  - the compact sticky bar adds the same way;
  - axe: the open panel has no serious or critical violations.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement** on the existing top `Sheet` (400 px from `md`, full width on phones); no timer; closes on route change.
- [ ] **Step 4: Verify and open the PR**
  - Run the full verification and the LCP and bundle checks against `v0.5.0`.
  - Browser-check the bag page and panel at the four widths; screenshots in the PR.
  - Update `CLAUDE.md`. Run the review, push (approval) and open the PR `Add the bag page and the added-to-bag panel`. Wait for the merge.

## Module 4: `feat/checkout`

### Task 9: The payment interface and Stripe

**Files:**
- Create: `src/lib/payments/types.ts`, `index.ts` (the provider for a name), `stripe.ts`, `fake.ts` (tests only).
- Modify: `src/lib/env.ts` (optional `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`; `paymentsConfigured(env)`); `.env.example`; `package.json` (the three Stripe packages, exact).
- Test: `src/lib/payments/stripe.test.ts` (Stripe client stubbed), `src/lib/env.test.ts`.

**Interfaces:**
- Produces:
  - `interface PaymentProvider { name: "stripe" | "fake"; startPayment(input: { checkoutId; email; lines: { name; unitPrice; quantity; image }[]; currency; expiresAt: Date }): Promise<{ reference: string; clientSecret: string }>; verify(reference): Promise<{ status: "authorised" | "paid" | "pending" | "failed" | "expired"; amount: number; currency: string; summary: string | null; shipping: ShippingAddress | null }>; settle(reference): Promise<void>; undo(reference): Promise<void>; parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent | null> }`;
  - `type PaymentEvent = { id: string; type: "payment.completed" | "payment.expired"; reference: string; checkoutId: string | null }`;
  - `paymentProvider(): PaymentProvider` (Stripe when configured, else throws "payments not configured").

- [ ] **Step 1: Write the failing tests:**
  - `startPayment` creates a session with `ui_mode: "elements"`, `mode: "payment"`, `payment_intent_data.capture_method: "manual"`, `expires_at` equal to the input (in seconds), USD line items in cents, `customer_email`, US-only shipping collection, and the checkout id in `client_reference_id` and metadata;
  - `verify` maps a session with an authorised PaymentIntent (`requires_capture`) to `authorised`, `succeeded` to `paid`, `expired` to `expired`, and reads "Visa ending 4242" and the shipping address;
  - `settle` captures; `undo` cancels an uncaptured PaymentIntent, expires an open session, and refunds a captured one;
  - `parseWebhook` accepts a body signed with `stripe.webhooks.generateTestHeaderString` and rejects a tampered body, a wrong secret and a stale timestamp; it maps `checkout.session.completed` and `checkout.session.async_payment_succeeded` to `payment.completed` and `checkout.session.expired` to `payment.expired`, and returns null for other events;
  - env: the three keys are optional; empty values count as unset.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** Pin `apiVersion: "2026-09-30.endive"`. `fake.ts` keeps state in memory and lets tests set each reference's status and make `settle` fail.
- [ ] **Step 4:** Run `npm test && npm run typecheck`. Expected: green. Commit `Add the payment interface and its Stripe provider`.

### Task 10: Hold tables and the transaction client

**Files:**
- Create: `src/db/schema/checkout.ts`; `drizzle/0008_checkouts.sql` (generated); `src/db/tx.ts` (server-only: a per-request Neon `Pool` client closed in `after()`); `src/lib/checkout/holds.ts` (server-only).
- Test: `src/lib/checkout/holds.test.ts` (PGlite), `src/db/migrations.test.ts`.

**Interfaces:**
- Produces:
  - `checkouts` and `checkoutItems` as in the spec; `status` is an enum (`open`, `fulfilled`, `expired`, `cancelled`); index on `(status, expires_at)`; `payment_reference` unique and nullable until the payment starts;
  - `type TxDb` (what both the Neon pool client and PGlite give to `transaction`); `withTransaction<T>(fn: (tx) => Promise<T>): Promise<T>`;
  - `releaseExpiredHolds(db): Promise<number>` (one statement: `WITH expired AS (UPDATE checkouts SET status = 'expired' WHERE status = 'open' AND expires_at < now() RETURNING id) UPDATE products … FROM (SELECT product_id, sum(quantity) …)`);
  - `releaseHold(db, checkoutId): Promise<boolean>` (the same statement for one id, only if `open`);
  - `takeStock(tx, lines): Promise<{ ok: true } | { ok: false; short: { productId; available }[] }>` (conditional updates; on any short line the caller rolls back);
  - `createHold(tx, { cartId, userId, email, lines, expiresAt })` and `findOpenHold(db, cartId)`.

- [ ] **Step 1: Write the failing tests** (Review Focus 1 and 2's stock side):
  - a hold takes stock; releasing it puts it back; releasing twice puts it back once;
  - `releaseExpiredHolds` releases only expired open holds and returns their count;
  - two transactions taking the last unit at once (PGlite: run them concurrently): one succeeds, one reports `short`, stock ends at 0 and never below;
  - a hold with one short line takes nothing (all-or-nothing);
  - the migration replay includes the tables.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** Generate the migration; `--check`, then migrate. `src/db/tx.ts` uses `drizzle-orm/neon-serverless` with `Pool` from `@neondatabase/serverless`, `casing: "snake_case"`, the schema barrel; tests inject the PGlite database.
- [ ] **Step 4:** Run `npm test`. Expected: green. Commit `Add stock holds and the transaction client`.

### Task 11: `startCheckout`

**Files:**
- Create: `src/lib/checkout/start.ts` (server-only core) and `src/lib/checkout/actions.ts` (`"use server"`); `src/lib/checkout/rate-limit.ts`.
- Test: `src/lib/checkout/start.test.ts` (PGlite + fake provider).

**Interfaces:**
- Produces: `startCheckout({ email })` → `ActionResult<{ checkoutId; clientSecret; expiresAt; summary: Bag }>`, or `{ ok: false, error: "invalid", reason: "empty" | "short" | "rate-limited" | "unavailable", bag?, short? }`.

- [ ] **Step 1: Write the failing tests** (Review Focus 1):
  - a bag with lines creates one open hold, takes the stock and calls `startPayment` with the hold's lines, prices from the database and `expiresAt` 31 minutes ahead; the payment reference is stored;
  - calling again with an unchanged bag reuses the hold (no new stock taken, same client secret);
  - changing the bag, then calling again, releases the old hold (stock back, the old payment undone) and creates a new one;
  - a short line holds nothing, lowers the bag line and returns `short` with the product and what's left;
  - two carts each with the last unit start at once: one hold, one `short`;
  - the sixth start from one IP inside 10 minutes returns `rate-limited`;
  - with Stripe unconfigured, `unavailable`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** The action reads the session or guest cookie, the IP (`x-forwarded-for`'s first value, as Better Auth does) and validates the email with the same Zod schema as sign-in. It runs `releaseExpiredHolds`, then the hold in `withTransaction`, then `startPayment` after the commit (a Stripe failure releases the hold).
- [ ] **Step 4:** Run `npm test`. Expected: green. Commit `Hold stock and start the payment when checkout starts`.

### Task 12: The checkout gate and page

**Files:**
- Create: `src/app/checkout/page.tsx`; `src/components/checkout/checkout-view.tsx`, `checkout-gate.tsx`, `checkout-form.tsx` (Stripe `CheckoutElementsProvider`, `AddressElement`, `PaymentElement`), `checkout-summary.tsx`, `demo-banner.tsx`, `stripe-appearance.ts`.
- Test: `e2e/checkout.spec.ts`, `e2e/stripe.ts` (helpers to type into Stripe's frames), `e2e/a11y.spec.ts`.

- [ ] **Step 1: Write the failing e2e tests** (skip without Stripe keys):
  - signed out, `/checkout` shows the gate; "Check out as a guest" with an email shows the page; "Sign in" goes to `/sign-in?returnTo=%2Fcheckout`; signed in, the gate is skipped and the email filled;
  - the demo banner shows the test card and Copy copies it;
  - the summary lists the bag and "We're holding your items until …";
  - an empty bag sends the shopper to `/bag`; a short line shows the "Only 1 … was left" message and the updated bag;
  - a declined test card (`4000 0000 0000 0002`) shows the error inline and keeps the form;
  - axe on the gate and the page (Stripe's frames excluded).
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** Load Stripe with `loadStripe` inside the checkout chunk only. Appearance: Geist, radius 0, `border-strong` bottom borders, black primary. `checkout.confirm()` with `returnUrl` `/checkout/success?checkout=<id>`. When the bag changes in another tab, the page restarts checkout on focus.
- [ ] **Step 4: Verify and open the PR**
  - Run the full verification, and check that `/`, a listing and a product page load no Stripe code.
  - Browser-check the gate and page at the four widths; screenshots in the PR.
  - Tell the user which Stripe keys go where (Vercel production and preview, `.env.local`, GitHub secrets for CI).
  - Update `CLAUDE.md`. Run the review, push (approval) and open the PR `Add checkout with stock held while you pay`. Wait for the merge.

## Module 5: `feat/orders`

### Task 13: Orders and fulfilment

**Files:**
- Create: `src/db/schema/orders.ts`; `drizzle/0009_orders.sql` (generated, plus the `order_number_seq` sequence); `src/lib/orders/fulfil.ts` (server-only); `src/lib/orders/queries.ts`.
- Test: `src/lib/orders/fulfil.test.ts` (PGlite + fake provider).

**Interfaces:**
- Produces:
  - `orders`, `orderItems`, `paymentEvents` as in the spec; `status` enum (`pending_capture`, `paid`, `cancelled`); `number` default `nextval('order_number_seq')`;
  - `fulfil(checkoutId, { db, tx, provider }): Promise<{ status: "confirmed"; order } | { status: "pending" | "failed" } | { status: "sold-out"; items: string[] }>`;
  - `formatOrderNumber(n: number): string` → `"ORR-10001"`.

- [ ] **Step 1: Write the failing tests** (Review Focus 2, 3 and 4):
  - an authorised payment on an open hold creates one order with copied names, prices and images, captures, marks it `paid` and the checkout `fulfilled`, and removes the bought lines from the cart;
  - two `fulfil` calls at once create one order and capture once;
  - a lapsed hold whose stock is still there takes it again and creates the order;
  - a lapsed hold whose stock sold elsewhere creates no order, marks the checkout `cancelled`, calls `undo` once and returns `sold-out` with the item names;
  - a capture failure cancels the order, puts the stock back and calls `undo`;
  - a call that stopped after the commit (the order left in `pending_capture`, the checkout `fulfilled`) is resumed by the next call: it captures and marks the order `paid` without creating a second order or touching stock; a fulfilled checkout returns early only once its order is `paid` or `cancelled`;
  - a cancelled checkout whose `undo` failed repeats `undo` on the next call while `verify` reports the payment authorised;
  - an authorised amount or currency that differs from the checkout's is undone and logged, never fulfilled;
  - `pending` and `failed` payments change nothing;
  - the migration replay includes the tables.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement** the steps in the spec's order: verify, then one transaction with `SELECT … FOR UPDATE` on the checkout, then `settle` or `undo` after the commit.
- [ ] **Step 4:** Run `npm test`. Expected: green. Commit `Turn paid holds into orders`.

### Task 14: The Stripe webhook

**Files:**
- Create: `src/app/api/payments/stripe/webhook/route.ts`.
- Test: `src/app/api/payments/stripe/webhook/route.test.ts`.

- [ ] **Step 1: Write the failing tests** (Review Focus 3 and 4):
  - a signed `checkout.session.completed` runs `fulfil` once and answers 200; the same event again answers 200 and does nothing (`payment_events`);
  - a signed `checkout.session.expired` releases the hold;
  - an unsigned or tampered request answers 400 and changes nothing;
  - a `fulfil` that throws answers 500 (so Stripe retries) and leaves the event unrecorded.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** Read the raw body with `await request.text()`. Record the event id only after handling succeeds (in the same transaction as fulfilment where possible).
- [ ] **Step 4:** Run `npm test`. Expected: green. Commit `Add the Stripe webhook`.

### Task 15: `/checkout/success`

**Files:**
- Create: `src/app/checkout/success/page.tsx`; `src/components/checkout/success-view.tsx`; `confirmCheckout` in `src/lib/checkout/actions.ts`.
- Test: `src/lib/checkout/confirm.test.ts`, `e2e/checkout.spec.ts`.

- [ ] **Step 1: Write the failing tests** (Review Focus 4):
  - `confirmCheckout` for the shopper's own checkout returns the order; for another shopper's (another guest cookie or user) it returns only `{ status: "received" }`;
  - it sets the count cookie after removing the bought lines;
  - **e2e (`@writes`, Stripe keys):** a guest pays with `4242…`; the success page shows "Thank you — order ORR-… is confirmed", the items, address and "Visa ending 4242"; the header count drops; stock dropped in the database;
  - **e2e:** a signed-in shopper sees View your orders; a guest sees "Create an account for faster checkout next time", which opens `/sign-up` with the email filled;
  - **e2e:** the hold made to lapse and the stock sold (set in the database before paying) shows "Sorry — … sold out while you were paying. Your card was not charged." and no order exists.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement** the confirmed, processing (re-check every 2 s for up to 30 s) and sold-out states.
- [ ] **Step 4:** Run them. Expected: green. Commit `Add the order confirmation page`.

### Task 16: The confirmation email

**Files:**
- Modify: `src/lib/email/templates.ts` (`orderConfirmationEmail`); `src/lib/email/send.ts` (report `{ ok }`, pass an idempotency key); `src/lib/orders/fulfil.ts` (claim, send, record after `paid`); `drizzle/0009_orders.sql` (`email_attempted_at`).
- Test: `src/lib/email/templates.test.ts`, `src/lib/orders/fulfil.test.ts`, `e2e/checkout.spec.ts` (the outbox).

- [ ] **Step 1: Write the failing tests:**
  - the template escapes names, lists items and totals, and links to the order (a guest key in guests' links);
  - two `fulfil` calls send one email;
  - a failed send leaves `email_sent_at` null and clears the claim, and the next `fulfil` call sends it;
  - a claim older than 10 minutes with no `email_sent_at` (a cut-off function) is taken over by the next call;
  - the send carries the idempotency key `order-confirmation/<order id>`;
  - **e2e:** the outbox receives one email for the order.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Generate the guest key with `crypto.randomBytes(32)` and store its SHA-256.
  - `sendEmail(email, { idempotencyKey })` returns `{ ok: boolean }` (the outbox counts as ok); it still never throws, and existing callers ignore the result.
  - In `after()`, once the order is `paid`: claim with `email_attempted_at` (null, or older than 10 minutes, and `email_sent_at` null), send, then set `email_sent_at` on `ok` or clear `email_attempted_at` on failure.
- [ ] **Step 4: Verify and open the PR**
  - Run the full verification. Measure `startCheckout` and the webhook against the budgets.
  - Browser-check the success page's three states at the four widths.
  - Tell the user how to create the production webhook endpoint (`https://orra-storefront.vercel.app/api/payments/stripe/webhook`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`) and set `STRIPE_WEBHOOK_SECRET`.
  - Update `CLAUDE.md`. Run the review, push (approval) and open the PR `Add orders, the webhook and the confirmation email`. Wait for the merge.

## Module 6: `feat/order-history`

### Task 17: Orders in the account

**Files:**
- Create: `src/app/account/orders/page.tsx`; `src/app/account/orders/[number]/page.tsx`; `src/components/orders/order-list.tsx`, `order-detail.tsx`.
- Modify: `src/components/account/account-overview.tsx` (the Orders tile with the count); `src/proxy.ts` (already covers `/account/*`).
- Test: `src/lib/orders/queries.test.ts`, `e2e/orders.spec.ts`.

- [ ] **Step 1: Write the failing tests:**
  - `getOrdersForUser` returns the user's orders newest first and never another user's; `getOrderForUser(number)` returns null for another user's order;
  - **e2e (`@writes`, Stripe keys):** after a signed-in purchase, `/account` shows "Orders (1)", `/account/orders` lists the order and its detail shows items, address, payment summary and total; another account's number 404s;
  - axe on both pages.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement** as static shells with content under `<Suspense>` calling `requireUser`.
- [ ] **Step 4:** Run them. Expected: green. Commit `Show orders in the account`.

### Task 18: The guest order link

**Files:**
- Create: `src/app/orders/[number]/page.tsx`.
- Test: `src/lib/orders/queries.test.ts`, `e2e/orders.spec.ts`.

- [ ] **Step 1: Write the failing tests** (Review Focus 4):
  - `getOrderForGuestKey(number, key)` matches only the right key (constant-time compare of hashes); a wrong or missing key and a signed-in user's order return null;
  - **e2e (Stripe keys):** the link from the guest's email (read from the outbox) shows the order; changing one character of the key shows a 404; the response is `private, no-store` and `noindex`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** The page is a static shell; the content under `<Suspense>` reads `searchParams`.
- [ ] **Step 4: Verify and open the PR**
  - Run the full verification. Browser-check the order pages at the four widths.
  - Update `CLAUDE.md`. Run the review, push (approval) and open the PR `Add order history`. Wait for the merge.

## Module 7: `docs/milestone-v0.6.0`

### Task 19: Record milestone `v0.6.0`

As in M4's Task 18:
- [ ] **Step 1:** Run `gh pr list --search 'milestone:"M5 · Bag & checkout" is:open'`. Expected: empty.
- [ ] **Step 2: Exit check.**
  - Production: `E2E_BASE_URL=https://orra-storefront.vercel.app npx playwright test --grep-invert @writes`, then one purchase with the test card as a signed-in test user: stock drops, the order shows in history, the email arrives (owner's address), and the user is deleted afterwards (orders keep `user_id` null).
  - Exit criteria 2 and 3 (the races) against the Neon dev branch.
  - Budgets: `/api/bag` server time, `startCheckout`, the webhook, and listing and product LCP against `v0.5.0` (local A/B as in M4).
- [ ] **Step 3: Milestone entry.** Add the `docs/milestones.md` entry without the Release line, then commit, push (approval) and open the PR. Wait for the merge.
- [ ] **Step 4: Tag and release.** Tag `v0.6.0` on the merge commit (annotated) and push it (approval); `gh release create v0.6.0 --title "v0.6.0 — Bag & checkout"`; close the milestone; add the Release line in a follow-up PR.
- [ ] **Step 5: Verify and report.** Check the release and the closed milestone. Update memory. The final report lists every ruling and deferred minor from the ledger.

---

## Execution notes

- **Ledger:** `.superpowers/sdd/2026-10-11-m5-bag-checkout/progress.md`. Record every ruling (a departure from this plan, with its reason and cost) and every deferred minor.
- **Worktrees:** `.worktrees/<module>`, with `.env` and `.env.local` symlinked. Run `node scripts/fix-intent-bin.mjs` after `npm ci`.
- **Stripe keys:** the user adds them before module 4's e2e can run; until then the checkout tests skip and the fake provider carries the logic. Local webhooks: `stripe listen --forward-to localhost:3000/api/payments/stripe/webhook`.
- **Neon WebSocket pool:** if `drizzle-orm/neon-serverless` transactions misbehave on Vercel, Neon's documented alternative (a TCP `pg` Pool with Vercel's `attachDatabasePool`) is the fallback, recorded as a ruling.
