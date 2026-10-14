import "server-only";

import { inArray, sql } from "drizzle-orm";

import { products } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import type { Transact } from "@/db/tx";
import { findCart, type CartRef } from "@/lib/bag/cart";
import { readBag } from "@/lib/bag/queries";
import type { Bag, BagLine } from "@/lib/bag/types";
import { closeReleasedPayment } from "@/lib/payments/close";
import { PaymentsUnavailableError, type PaymentProvider } from "@/lib/payments/types";
import { rowsOf } from "@/lib/bag/queries";
import { createHold, findOpenHold, releaseCartHolds, releaseExpiredHolds, releaseHold, takeStock, type HoldLine, type OpenHold } from "./holds";
import { allowCheckoutStart } from "./rate-limit";

/**
 * Stripe won't create a session that expires sooner than 30 minutes ahead; 31 leaves room for the
 * request. The session expires with the hold (the same `expires_at`); see HOLD_GRACE for the gap
 * before a lapsed hold's stock is given to others.
 */
export const HOLD_MINUTES = 31;

export type ShortLine = { slug: string; name: string; available: number };

export type StartResult =
  | { ok: true; data: { checkoutId: string; clientSecret: string; expiresAt: string; summary: Bag } }
  | { ok: false; error: "invalid"; reason: "short"; message: string; bag: Bag; short: ShortLine[] }
  | { ok: false; error: "invalid"; reason: "empty" | "rate-limited" | "unavailable" | "email"; message: string }
  | { ok: false; error: "failed"; message: string };

export type StartDeps = {
  db: SeedDatabase;
  transact: Transact;
  /** Throws PaymentsUnavailableError when payments aren't configured. */
  provider: () => PaymentProvider;
  /** On for Vercel production and previews only (local runs and CI share one IP). */
  rateLimit: boolean;
  /** The site's origin, for the payment's return URL. */
  baseUrl: string;
};

const FAILED = { ok: false, error: "failed", message: "Something went wrong. Try again." } as const;
const EMPTY = { ok: false, error: "invalid", reason: "empty", message: "Your bag is empty." } as const;

/** Closes a released hold's payment unless it was paid meanwhile (see closeReleasedPayment). */
async function closeReleased(deps: StartDeps, reference: string) {
  try {
    await closeReleasedPayment(deps.provider(), reference);
  } catch (error) {
    // Payments not configured: nothing was started to close.
    console.error("checkout: couldn't close a released payment", error instanceof Error ? error.message : error);
  }
}

/** "Only 1 Leather tote was left — your bag has been updated", or which items sold out. */
export function shortMessage(short: ShortLine[]): string {
  const [first] = short;
  if (short.length > 1 || !first) return "Some items in your bag sold out or ran low — your bag has been updated";
  return first.available > 0
    ? `Only ${first.available} ${first.name} ${first.available === 1 ? "was" : "were"} left — your bag has been updated`
    : `The ${first.name} sold out — your bag has been updated`;
}

const sameHold = (hold: OpenHold, email: string, lines: HoldLine[]) =>
  hold.email === email &&
  hold.lines.length === lines.length &&
  lines.every((line) => hold.lines.some((held) => held.productId === line.productId && held.quantity === line.quantity && held.unitPrice === line.unitPrice));

/**
 * Starts (or resumes) checkout for this shopper's bag:
 * 1. releases every lapsed hold, so their stock counts again (and an emptied bag's own holds);
 * 2. reads the bag at live stock; if that lowered a line, or a line has sold out with nothing
 *    left to buy, nothing is held and the shopper sees the updated bag first;
 * 3. reuses this bag's open hold when nothing changed, resuming its payment;
 * 4. otherwise, within the rate limit, in one transaction: releases the bag's holds, records the
 *    new hold, then takes the stock all or nothing (a short line rolls it all back). The hold row
 *    goes first so a second start for the same bag waits on the one-open-hold index and then uses
 *    the winner's hold, instead of finding its stock gone;
 * 5. starts (or resumes) the hold's payment, built from the hold alone, and closes the payments of
 *    the holds it replaced (unless paid in their last seconds).
 * Prices always come from the database.
 */
export async function startCheckoutWith(deps: StartDeps, { cart: ref, email, ip }: { cart: CartRef; email: string; ip: string | null }): Promise<StartResult> {
  const { db } = deps;
  const cart = await findCart(db, ref);
  if (!cart) return EMPTY;

  // Best effort: a failed sweep (say, a deadlock with another release) mustn't stop this start.
  await releaseExpiredHolds(db).catch((error) => console.error("checkout: sweep failed", error instanceof Error ? error.message : error));
  const bag = await readBag(db, cart.id);
  if (bag.lines.length === 0) {
    // An emptied bag gives back what it still held, and its payments can't go through.
    for (const reference of await releaseCartHolds(db, cart.id)) await closeReleased(deps, reference);
    return EMPTY;
  }

  let provider: PaymentProvider;
  try {
    provider = deps.provider();
  } catch (error) {
    if (error instanceof PaymentsUnavailableError) return { ok: false, error: "invalid", reason: "unavailable", message: "Checkout isn't available right now." };
    throw error;
  }

  const changed = bag.lines.filter((line) => line.note === "reduced" || (line.note === "sold-out" && bag.count === 0));
  if (changed.length > 0) return shortAnswer(bag, changed.map((line) => ({ slug: line.slug, name: line.name, available: line.stock })));

  const buyable = bag.lines.filter((line) => line.note !== "sold-out");
  const lines = await holdLines(db, buyable);
  const existing = await findOpenHold(db, cart.id);

  let hold: OpenHold;
  // A hold this request created (released again if its payment can't start), not one it found.
  let created = false;
  let replaced: string[] = [];
  if (existing && sameHold(existing, email, lines)) {
    hold = existing;
  } else {
    if (deps.rateLimit && ip && !(await allowCheckoutStart(db, ip))) {
      return { ok: false, error: "invalid", reason: "rate-limited", message: "Too many checkouts started. Try again in a few minutes." };
    }
    const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);
    try {
      const result = await deps.transact(async (tx) => {
        // Another start for this bag may have committed since `existing` was read.
        const current = await findOpenHold(tx, cart.id);
        if (current && sameHold(current, email, lines)) throw new UseHold(current);
        const released = await releaseCartHolds(tx, cart.id);
        const { id } = await createHold(tx, { cartId: cart.id, userId: ref.userId, email, lines, expiresAt });
        const taken = await takeStock(tx, lines);
        // Throwing rolls the transaction back: nothing is held, nothing released.
        if (!taken.ok) throw new ShortStock(taken.short);
        return { id, released };
      });
      hold = { id: result.id, email, amount: lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0), paymentReference: null, expiresAt, lines: [...lines].sort((a, b) => a.productId - b.productId) };
      created = true;
      replaced = result.released;
    } catch (error) {
      if (error instanceof UseHold) {
        hold = error.hold;
      } else if (error instanceof ShortStock) {
        // Re-reading the bag lowers it to what's left.
        const updated = await readBag(db, cart.id);
        const byId = new Map(buyable.map((line, index) => [lines[index]!.productId, line]));
        return shortAnswer(
          updated,
          error.short.map(({ productId, available }) => ({ slug: byId.get(productId)!.slug, name: byId.get(productId)!.name, available })),
        );
      } else {
        // Another start for this bag won the race to the one open hold: use it if it matches.
        const winner = await findOpenHold(db, cart.id);
        if (!winner || !sameHold(winner, email, lines)) {
          console.error("checkout: couldn't hold the bag", describe(error));
          return FAILED;
        }
        hold = winner;
      }
    }
  }

  const payment = await paymentFor(deps, provider, hold);
  // The replaced holds' payments mustn't stay payable, whatever happens to the new one (unless one
  // was paid in its last seconds: fulfilment takes that).
  for (const reference of replaced) await closeReleased(deps, reference);
  if (!payment) {
    // Only a hold this request made is given back; a found one may be another tab's checkout.
    if (created) await releaseHold(db, hold.id);
    return FAILED;
  }
  return { ok: true, data: { checkoutId: hold.id, clientSecret: payment.clientSecret, expiresAt: hold.expiresAt.toISOString(), summary: bag } };
}

/**
 * The hold's payment: resumed when it has one, else started from the hold alone (its lines by
 * product id, its email and expiry), so a retry or a concurrent start for the same hold sends
 * Stripe the same request under the same idempotency key. The reference is stored only while the
 * hold is still open; a payment for a hold released meanwhile is undone. Null when it failed.
 */
async function paymentFor(deps: StartDeps, provider: PaymentProvider, hold: OpenHold): Promise<{ clientSecret: string } | null> {
  try {
    if (hold.paymentReference) return await provider.resume(hold.paymentReference);
    const payment = await provider.startPayment({
      checkoutId: hold.id,
      email: hold.email,
      currency: "USD",
      expiresAt: hold.expiresAt,
      returnUrl: `${deps.baseUrl}/checkout/success?checkout=${hold.id}`,
      lines: hold.lines.map(({ name, unitPrice, quantity }) => ({ name, unitPrice, quantity })),
    });
    const stored = rowsOf<{ id: string }>(
      await deps.db.execute(sql`
        update checkouts set payment_provider = ${provider.name}, payment_reference = ${payment.reference}
        where id = ${hold.id} and status = 'open' and (payment_reference is null or payment_reference = ${payment.reference})
        returning id`),
    );
    if (stored.length === 0) {
      await closeReleased(deps, payment.reference);
      return null;
    }
    return payment;
  } catch (error) {
    console.error("checkout: the payment didn't start", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Thrown inside the transaction to roll it back and use a matching hold that's already there. */
class UseHold extends Error {
  constructor(readonly hold: OpenHold) {
    super("use the open hold");
  }
}

class ShortStock extends Error {
  constructor(readonly short: { productId: number; available: number }[]) {
    super("short");
  }
}

/** An error's message with its cause's (Drizzle wraps the database's error in `cause`). */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
  return `${error.message.split("\n")[0]}${cause}`;
}

function shortAnswer(bag: Bag, short: ShortLine[]): StartResult {
  return { ok: false, error: "invalid", reason: "short", message: shortMessage(short), bag, short };
}

/** The bag's buyable lines as hold lines, in the same order, with product ids from the database. */
async function holdLines(db: SeedDatabase, lines: BagLine[]): Promise<HoldLine[]> {
  const rows = await db.select({ id: products.id, slug: products.slug }).from(products).where(inArray(products.slug, lines.map((line) => line.slug)));
  const ids = new Map(rows.map((row) => [row.slug, row.id]));
  return lines.map((line) => ({ productId: ids.get(line.slug)!, name: line.name, unitPrice: line.unitPrice, quantity: line.quantity }));
}
