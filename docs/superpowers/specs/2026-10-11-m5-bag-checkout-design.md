# Orra M5: bag and checkout (design)

- **Date:** 2026-10-11
- **Status:** awaiting review
- **Milestone:** M5 Bag & checkout → `v0.6.0`, as scoped in the [roadmap](2026-10-04-roadmap-to-live-design.md)
- **Scope of this spec:** a server-side bag, the bag page and the added-to-bag panel, checkout with stock held while the shopper pays, Stripe payments (test mode) behind a payment-provider interface, orders and their fulfilment, the success page and confirmation email, order history, and their tests. The M5 plan (`docs/superpowers/plans/2026-10-11-m5-bag-checkout.md`) turns it into tasks.
- **Not in this spec:** the admin and order status changes (M6), the nightly demo reset (M6), a verified email domain (M7), Paystack and naira prices (a post-launch milestone, `v1.1.0`).

## Intent

**What M5 is for:** a shopper can buy something.
- The bag lives on the server, so it survives a cleared browser and follows a signed-in shopper to any device. A guest bag moves into the account on sign-in.
- Checkout happens on Orra's own page, in Orra's design, and the stock is held while the shopper pays. Two people can't both pay for the last unit.
- A paid order lowers stock, appears in the shopper's order history and sends a confirmation email.
- Every page stays as fast and as cached as in `v0.5.0`: knowing what's in the bag never costs a request per page view.

**Decisions made while brainstorming:**

| Question | Decision |
|---|---|
| Where shoppers pay | **On Orra's own `/checkout` page:** contact, delivery address and Stripe's Payment Element, styled to match. Stripe Checkout Sessions in `elements` UI mode (Stripe renamed `custom` to `elements` in its Dahlia release). Stripe's hosted page was the roadmap's plan; it was rejected because the payment step wouldn't look like Orra. |
| Stopping the last unit selling twice | **Hold stock during checkout.** Starting checkout takes the units out of stock for 31 minutes; the Stripe session expires with the hold. Payments are authorised, then captured only once the order is secured, so an oversell (a hold that lapsed while the shopper paid, and sold to someone else) cancels the authorisation: no money is ever taken. The roadmap's exit wording changes from "one automatic refund" to "one cancelled payment". |
| Who can check out | **Guests and accounts.** A gate asks for an email, then "Check out as a guest" or "Sign in", like Gucci. |
| Add-to-bag feedback | **A Gucci-style panel** under the header: the item, then Checkout and View bag. |
| Payment provider | **Stripe (test mode), behind a payment-provider interface.** Paystack and Flutterwave were researched as Nigerian alternatives. Neither offers card fields embedded in our page or a hold-then-capture; Paystack has no session expiry and Flutterwave's two API versions each lack something we need. The user chose Stripe now and **Paystack after v1.0.0**, so M5 builds the interface and the provider-neutral data, and ships only Stripe. |
| Delivery | **US only**, matching the USD prices; complimentary, with the existing estimated window. |
| Webhooks on previews | **The success page finishes the order.** Previews sit behind the Vercel login, so the success page confirms the payment with Stripe and runs the same fulfilment the webhook runs. Production gets the webhook; local development uses `stripe listen`. |
| How pages know the bag | **A count cookie plus a bag API.** The bag lives in Postgres. Server actions change it and set a small readable cookie holding the item count, which the header reads without a request. `/bag`, the panel and checkout read `GET /api/bag` through TanStack Query with optimistic updates (the `useSaved` pattern). Fetching the bag on every page, and rendering the header on the server, were rejected: the first costs a function call and a database read per page view, the second makes every page dynamic. |
| TanStack DB (carried from the roadmap) | **Not adopted.** It's at 0.13 (not 1.0) and about 95 KB gzipped; `useMutation` with optimistic updates covers a bag of at most 50 lines. |

The design was presented in five sections, and the user approved each one: modules; the bag's data, cookies and merge; the bag page and panel; checkout, holds and the payment interface; orders, fulfilment, history, testing, security and speed. The UI follows Gucci UK's added-to-bag panel, shopping bag and checkout gate, researched in the browser first.

**Assumptions** (stated to the user and not contradicted): the user has a Stripe account with a sandbox and adds the keys; emails still go through Resend's test sender (only the owner receives them) until M7.

## Exit criteria (from the roadmap, updated)

1. A test purchase lowers stock, appears in the shopper's order history and sends the confirmation email.
2. Two checkouts racing for the last unit result in one hold and one "sold out" message.
3. A payment completed after its hold lapsed and the unit sold elsewhere results in one cancelled payment and no order.

The roadmap's single criterion ("concurrent purchases of the last unit result in one order and one automatic refund") becomes 2 and 3, because holds stop most races before payment and manual capture turns the rest into a cancelled authorisation instead of a refund.

## Out of scope

- Taxes, discounts and promotion codes, gift cards, multiple currencies (the roadmap's out-of-scope list).
- Saved addresses and saved cards; delivery outside the US.
- Changing an order after it's placed, and order status changes (M6's admin).
- Paystack, naira prices and Nigerian addresses (post-launch `v1.1.0`; this spec only leaves room for them).
- A "You may also like" row on the bag page.

## Modules

| # | Branch | Delivers |
|---|---|---|
| 1 | `docs/m5-bag-checkout` | This spec, the plan, and the roadmap changes below. |
| 2 | `feat/server-bag` | `carts` and `cart_items`; the signed guest cookie and the count cookie; bag server actions capped at live stock; `GET /api/bag`; the merge on sign-in; the one-time move of browser bags; the header count from the cookie; the narrowed search trigger. |
| 3 | `feat/bag-page` | `/bag`; the added-to-bag panel; the product page's Add to bag on the server bag. |
| 4 | `feat/checkout` | The checkout gate and page; stock holds (`checkouts`, `checkout_items`); the transaction client; the payment-provider interface and its Stripe implementation; the checkout rate limit. |
| 5 | `feat/orders` | `orders`, `order_items`, `payment_events`; fulfilment; the Stripe webhook; `/checkout/success`; the confirmation email. |
| 6 | `feat/order-history` | Orders in the account; the guest order link. |
| 7 | `docs/milestone-v0.6.0` | Exit check on production, budgets, `v0.6.0` tag and release. |

## The server-side bag (module 2)

### Data

`src/db/schema/cart.ts` (migration `0007`):
- **`carts`:** `id` (UUID, random), `user_id` (text, unique, nullable; null means a guest cart; cascades when the user is deleted), `created_at`, `updated_at`.
- **`cart_items`:** `cart_id` (cascade) and `product_id` (cascade) as the primary key, `quantity` (`> 0`), `added_at`.
- **Limits** (`src/lib/bag/limits.ts`): at most `MAX_QUANTITY` (10) of one item and never more than live stock, at most `BAG_LINE_LIMIT` (50) lines.

The same migration **narrows the search trigger** (carried from M3): `products_search_refresh` fires on insert and on updates of `name`, `description`, `colour`, `colour_family`, `material`, `category_id` and `details` only, so stock changes no longer rebuild the search index. A category rename still re-saves its products, because `categories_search_refresh` sets `category_id`.

Abandoned guest carts stay until M6's nightly job deletes those older than 30 days.

### Cookies

Both are set only in server actions and route handlers, never during rendering, so pages stay prerendered.
- **`__Host-orra_cart`** (guest bag): the cart id plus an HMAC signature keyed from `BETTER_AUTH_SECRET` with its own label, so forged ids are rejected without a database read and no new secret is needed. `HttpOnly`, `Secure`, `SameSite=Lax` (Strict would drop it on the return from Stripe), `Path=/`, 30 days, renewed whenever the bag changes. Created on the first add only.
- **`orra_bag_count`** (readable, `SameSite=Lax`, 0–999): written by every bag action, `GET /api/bag`, the sign-in merge and fulfilment; cleared on sign-out (the account's bag stays in the account and the browser starts with an empty guest bag).

### Reads

`GET /api/bag` (`private, no-store`) finds the cart from the session (uncached, as M4's data access layer does) or the guest cookie and returns `{ lines, count, subtotal, currency }`. Each line carries the slug, name, colour, unit price, card image, live stock and quantity. Stock is read from the database, not the catalogue cache:
- A line whose stock fell below its quantity is lowered and carries a note ("Only 2 left — we've updated your bag").
- A sold-out line stays, marked sold out, and is left out of the count, the subtotal and checkout.

### Writes

Server actions (`src/lib/bag/actions.ts`) with Zod-validated input, returning M4's `ActionResult`:
- `addToBag(slug, quantity = 1)`, `setQuantity(slug, quantity)`, `removeFromBag(slug)`;
- `moveToSaved(slug)`: removes the line and saves the item (to the account when signed in; the client adds it to the browser list when signed out);
- `importLines(lines)`: the one-time move below.

Each is one SQL statement (the Neon HTTP driver has no interactive transactions). The add is an `INSERT … ON CONFLICT DO UPDATE SET quantity = LEAST(old + added, stock, 10)`, so concurrent clicks can't pass the stock cap. Each returns the updated bag and whether the add was capped, and sets the count cookie.

### Merge on sign-in

A Better Auth after-hook, set in `auth.ts` (server-only, so the CLI config never sees it) and passed into `createTestAuth` the way the reset-email sender is, runs on a successful sign-in or sign-up: it reads the guest cookie, adds those lines to the user's cart (summing, capped at stock, 10 per item and 50 lines), deletes the guest cart and cookie, and sets the count. The full page load after sign-in shows the merged bag; no client sync is needed. Signing out never copies the account's bag into the browser.

### One-time move of browser bags

Shoppers may hold lines in `orra:bag:v1` from before M5. On first load, `BagImport` (mounted in the providers) sends them to `importLines`, which adds each with the usual caps, then removes `lines` from local storage and keeps `saved`. It does nothing when there are no lines. The browser store keeps only saved items from then on.

### Client

- `useBag()` (`src/lib/bag/use-bag.ts`) reads `["bag"]` and updates it optimistically with rollback; mutations are serialised in click order (one mutation scope) and the bag is re-read after the last settles, as in `useSaved`.
- `useBagCount()` reads the count cookie (re-read on focus and after the shopper's own changes). The header's `BagLink` uses it: "Bag, 2 items", linking to `/bag`.

## The bag page and panel (module 3)

### `/bag`

A static shell with the client `BagView`, `noindex`, following Gucci's shopping bag in Orra's tokens (no hero image):
- "Shopping bag (n)". On phones a "Checkout · $total" button sits under the heading.
- From `lg`, the lines take two-thirds of the width with the order summary beside them; on phones the summary follows the lines.
- **Line:** photo (`Media` 4:5) and name linking to the product, colour, unit price, a native `<select>` for the quantity (1 up to stock, at most 10), line total, "Move to saved items" and "Remove".
- **Remove** is immediate and leaves "Leather tote removed. Undo" in the line's place (focus moves to Undo), instead of Gucci's confirmation dialog.
- **Stock notes** on the line; sold-out lines offer Remove and Move to saved items.
- **Summary:** subtotal, "Delivery: Complimentary", the estimated window (`deliveryWindow`), total, "No taxes are charged in this demo", the black Checkout button (to `/checkout`; disabled when nothing can be bought) and "Payments run in Stripe test mode — no real money".
- **Empty:** "Your bag is empty", links to New in, Women and Men, and "You have n saved items" when there are any.
- Skeleton while loading; an error state with Try again.

### Added-to-bag panel

Opens after the server confirms an add (the button shows "Adding…" meanwhile), so it never shows an item that failed. It's the existing top `Sheet` (already loaded for search and the phone menu): full width on phones, 400 px and aligned right under the header from `md`. Content: "Added to bag" and close; the item's photo, name, colour, price and the quantity now in the bag; "You have all 2 available in your bag" when the add hit the cap; a black Checkout button and an outlined View bag. Focus moves into the panel; Escape, a click outside or a route change closes it and returns focus to Add to bag. No timer.

### Product page

`PurchaseActions` uses `useBag()`: Add to bag, Adding…, Sold out, and "All available in your bag" when the bag holds all the stock; the compact sticky bar matches. The cap comes from the server's live stock; when the page's cached stock was out of date, the panel explains ("Only 1 was left — it's in your bag"). Save for later is unchanged.

## Checkout (module 4)

### `/checkout`

A static shell with the client `CheckoutView`, `noindex`.
- **Gate** (signed out): "Enter your email to continue", Email, a black "Check out as a guest" with "You can create an account after your order", and an outlined "Sign in" (`/sign-in?returnTo=/checkout`). Signed-in shoppers skip it, with their email filled in.
- **Page:**
  - A demo banner: "Demo store — pay with the test card 4242 4242 4242 4242, any future date, any CVC", with a Copy button.
  - **1 Contact:** the email, with Change.
  - **2 Delivery:** Stripe's Address Element, US only (name, address, city, state, ZIP, autocomplete); delivery "Complimentary — estimated …".
  - **3 Payment:** Stripe's Payment Element (cards and Link; Apple Pay and Google Pay on the production domain only, since wallets need per-domain registration).
  - **Summary** (beside the form from `lg`, collapsed at the top on phones): lines, subtotal, delivery, total, and "We're holding your items until 3:45 pm".
  - A full-width black "Pay $1,960". Errors such as a declined card appear inline in Orra's style and take focus.
  - Stripe's Appearance API matches Orra: Geist, square corners, `border-strong` underlines, black as the primary colour.
- Stripe's script and React library load only on `/checkout`.

### Holds

`src/db/schema/checkout.ts`:
- **`checkouts`:** `id` (UUID), `cart_id`, `user_id` (nullable), `email`, `status` (`open`, `fulfilled`, `expired`, `cancelled`), `amount`, `currency`, `payment_provider`, `payment_reference` (unique), `expires_at`, `created_at`.
- **`checkout_items`:** `checkout_id`, `product_id`, `name`, `unit_price`, `quantity`.

**Starting checkout** (`startCheckout({ email })`, a server action), in one transaction:
1. Release expired holds (below).
2. Reuse this cart's open hold when the bag hasn't changed, so a refresh doesn't create another.
3. Otherwise release the cart's old hold and create a new one: the `checkouts` row (`expires_at` = now + 31 minutes), its items at today's names and prices, and each line's stock taken with `UPDATE products SET stock = stock - q WHERE id = $id AND stock >= q`.
4. If any line is short, nothing is held: the transaction rolls back, the bag is lowered to what's left, and the page says so ("Only 1 Leather tote was left — your bag has been updated").
5. Start the payment (below) and return `{ checkoutId, clientSecret, expiresAt, summary }`.

**Transactions:** the Neon HTTP driver has none, so `src/db/tx.ts` adds a client on Neon's WebSocket `Pool` (`drizzle-orm/neon-serverless`), created per request and closed in `after()`. Only holds and fulfilment use it; every other read and write stays on HTTP. Tests use PGlite, which supports transactions through the same Drizzle API.

**Releasing a hold** happens on Stripe's `checkout.session.expired`, on the sweep at the start of every `startCheckout`, and when the bag changes mid-checkout (the old hold is released and a new one started). One statement marks the hold `expired` (only if still `open`) and puts its stock back, so a second release does nothing. Releasing early also expires the Stripe session, so it can't be paid.

**Abuse limit:** 5 checkout starts per IP per 10 minutes, stored in the existing `rate_limit` table. With the 10-per-item cap and the 31-minute expiry, scripted hoarding can only hold so much.

### Payment-provider interface

`src/lib/payments/` defines one interface; the rest of the app imports only it:
- `startPayment(checkout)` → `{ reference, clientSecret, expiresAt }`
- `verify(reference)` → `{ status: "authorised" | "paid" | "pending" | "failed" | "expired", amount, currency, summary }`
- `settle(reference)`: take the money.
- `undo(reference)`: release it (cancel an authorisation, expire an open session, or refund money already taken).
- `parseWebhook(request)` → a verified, provider-neutral event, or a rejection.

**Stripe** (`src/lib/payments/stripe.ts`): `stripe@23`, pinned to API version `2026-09-30.endive`; the client uses `@stripe/stripe-js@10` and `@stripe/react-stripe-js@7`. `startPayment` creates a Checkout Session with `ui_mode: "elements"`, `mode: "payment"`, line items in USD cents from the hold, `customer_email`, US-only shipping address collection, `payment_intent_data.capture_method: "manual"`, `expires_at` equal to the hold's, and the checkout id as `client_reference_id` and metadata. `settle` captures the PaymentIntent; `undo` cancels it, expires the session, or refunds.

A **fake provider** (`src/lib/payments/fake.ts`) drives the unit tests. Paystack, later, implements the same interface; its `settle` has nothing to do and its `undo` refunds.

**Env** (optional in `src/lib/env.ts`, so builds and CI work without them; checkout says it's unavailable until they're set). The user adds them; they're never read by the implementer:

| Variable | Where |
|---|---|
| `STRIPE_SECRET_KEY` | Vercel production and preview, `.env.local` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Vercel production and preview, `.env.local` (public by design) |
| `STRIPE_WEBHOOK_SECRET` | Vercel production; locally the one `stripe listen` prints |

**Paying:** `checkout.confirm()` returns to `/checkout/success?checkout=<id>`.

## Orders (modules 5 and 6)

### Data

`src/db/schema/orders.ts`:
- **`orders`:** `id`, `number` (from a sequence, shown as "ORR-10001"), `checkout_id` (unique), `user_id` (nullable; set to null when the account is deleted, so the record stays), `email`, `status` (`pending_capture`, `paid`, `cancelled`; M6 adds `fulfilled`), `subtotal`, `currency`, `shipping` (name and address, JSON), `payment_provider`, `payment_reference` (unique), `payment_summary` (e.g. "Visa ending 4242"), `guest_key_hash`, `email_sent_at`, `created_at`.
- **`order_items`:** `order_id`, `product_id` (set to null if the product is deleted), and `name`, `unit_price`, `quantity` and `image` as they were at purchase.
- **`payment_events`:** `id` (the provider's event id), `provider`, `received_at`; a repeated delivery is skipped.

### Fulfilment

`fulfil(checkoutId)` is safe to call twice or at the same moment; the webhook and the success page both call it.
1. A fulfilled checkout returns its order.
2. `verify` the payment. Not authorised: return pending or failed, changing nothing.
3. The authorised amount and currency must equal the checkout's; a mismatch is undone and logged, never fulfilled.
4. In one transaction, lock the checkout row (`FOR UPDATE`):
   - **Hold open:** create the order (`pending_capture`) and its items; mark the checkout `fulfilled`.
   - **Hold lapsed:** take the stock again with the same conditional update. If that works, carry on as above; if not, mark the checkout `cancelled`.
5. After the commit: `settle`, then mark the order `paid`. If capture fails, put the stock back, mark the order `cancelled` and `undo`. A later call retries an order still in `pending_capture`. For a cancelled checkout, `undo` (the authorisation is cancelled; no money is taken).
6. Remove the bought lines from the cart, set the count cookie (when called from the success page) and send the email once.

### Webhook

`/api/payments/stripe/webhook` reads the raw body and verifies it (`parseWebhook`), records the event id (a duplicate gets 200 and stops), then: `checkout.session.completed` and `checkout.session.async_payment_succeeded` run `fulfil`; `checkout.session.expired` releases the hold. It answers 200 when handled and 500 so Stripe retries on a temporary failure.

### `/checkout/success?checkout=<id>`

A static shell, `noindex`; the client calls `confirmCheckout(id)`, which runs `fulfil`.
- **Confirmed:** "Thank you — order ORR-10001 is confirmed", the items, delivery address, estimated delivery and payment summary, and "We've emailed a confirmation to …" with the note that, in this demo, emails only reach the store owner until launch. Signed in: View your orders. Guest: "Create an account for faster checkout next time" (the email goes to `/sign-up` through session storage). The page doesn't promise to attach this order: emails aren't verified until M7.
- **Processing:** "Confirming your payment…", re-checking every 2 seconds for up to 30 seconds, then "We'll email you when it's confirmed".
- **Sold out while paying:** "Sorry — the Leather tote sold out while you were paying. Your card was not charged.", with a link back to the bag.
- Details are shown only to the signed-in owner or to the browser whose guest cart started this checkout; anyone else sees "Order received".

### Confirmation email

`orderConfirmationEmail` (house style, escaped): order number, items, totals, address, estimated delivery and a link to the order. Sent in `after()`, exactly once: `UPDATE orders SET email_sent_at = now() WHERE id = $1 AND email_sent_at IS NULL RETURNING id` before sending. Guests' links carry a random key; only its SHA-256 hash is stored.

### Order history (module 6)

- `/account/orders`: number, date, status, total and item photos. `/account`'s Orders tile shows the count.
- `/account/orders/[number]`: the order's detail.
- `/orders/[number]?key=…`: the same detail for guests, no account needed (`private, no-store`, `noindex`, keys compared in constant time).
- Each is a static shell with its content under `<Suspense>`, as `/account` is.

## Errors and security

- Prices and totals come from the database, never from the client; fulfilment checks the authorised amount.
- Webhooks are verified on the raw body; repeated events are skipped.
- Checkout and order ids are UUIDs, and every read checks ownership (the session's user, or the guest cart cookie); guest order keys are stored hashed and compared in constant time.
- Card data never reaches Orra's servers (Stripe's iframes).
- Server actions check the session themselves, as in M4, and validate input with Zod.
- Checkout starts are rate-limited; the guest cookie is signed.
- Bag and checkout errors are inline, in polite live regions, and never lose the shopper's bag.

## Testing

| Layer | Covers |
|---|---|
| Unit | Bag limits and caps; the cookie signature; the payment interface's Stripe mapping (Stripe client stubbed); webhook signatures with Stripe's offline `generateTestHeaderString`; email templates. |
| Database (PGlite, real migrations) | Bag actions including concurrent adds; the sign-in merge hook through `createTestAuth`; the one-time import; holds (create, reuse, short line, release, sweep, concurrent starts for the last unit); fulfilment with the fake provider (normal path, two calls at once giving one order, lapsed hold taken again, lapsed hold sold out and undone, capture failure, amount mismatch); duplicate webhook events; email sent once; the narrowed search trigger (a stock update leaves the index alone, a rename updates it); the migration replay. |
| End-to-end (Playwright, desktop and mobile) | Add to bag and the panel; quantity, Remove and Undo, Move to saved; the stock cap and a sold-out line; the guest bag merging on sign-in; the one-time import; the checkout gate; paying with Stripe test cards typed into Stripe's frames; success, processing and sold-out states; order history for a shopper and a guest link. Checkout tests need Stripe test keys and skip without them (the user adds them as GitHub secrets for CI). Fulfilment in e2e goes through the success page, the same path previews use. |
| Accessibility (axe) | `/bag` (full and empty), the open panel, `/checkout`, the success page and the order pages. |

**Production exit check:** the e2e suite without `@writes`; one purchase with the test card (it lowers real demo stock until M6's reset), seen in order history, with the email arriving at the owner's address. The races (exit criteria 2 and 3) run against the Neon dev branch, so production stock isn't drained.

## Performance budgets

| Measure | Budget |
|---|---|
| Listing and product page LCP | No worse than `v0.5.0` (the header count makes no request; the panel reuses the loaded `Sheet`) |
| `GET /api/bag` server time | < 50 ms |
| `startCheckout` | < 1.5 s, including Stripe |
| Webhook handling | < 1 s |
| Stripe's JavaScript | Only on `/checkout` |

## Docs and roadmap changes

- **`CLAUDE.md`:** the bag (data, cookies, actions, merge, import), checkout and holds, the payment interface and Stripe setup, orders and fulfilment, the success page, order history, the env vars and the Stripe test keys for e2e.
- **`.env.example`:** the three Stripe variables.
- **Roadmap:** M5's exit criteria as above; `elements` UI mode instead of the hosted page; previews finish orders on the success page; the data line for M5 gains `checkouts`, `checkout_items` and `payment_events`, and orders store `payment_provider`/`payment_reference` instead of `stripe_session_id`; the webhooks-on-previews risk is settled; a new post-launch milestone, **Paystack → `v1.1.0`**: a Paystack provider and popup, naira prices, Nigerian delivery addresses, and choosing the provider by currency.

## Risks

- **Stripe in CI.** Checkout e2e needs the network and test keys; without the secrets they skip, so the database tests carry the logic. Mitigation: the fake provider covers every fulfilment path offline.
- **Stock shown on product pages can be up to 5 minutes old** (catalogue cache). The bag and checkout always use live stock and explain any difference.
- **Holds lower visible stock** while a shopper pays; an abandoned checkout keeps units away for up to 31 minutes. Accepted for a demo; the rate limit bounds abuse.
- **Wallets** (Apple Pay, Google Pay) only work on the registered production domain, not on previews.
- **Emails** only reach the owner until M7.

## Left to the plan

Exact file names beyond those above, the order of tasks within each module, the Stripe Appearance values, the `BagImport` timing, and the e2e helpers for typing into Stripe's frames.
