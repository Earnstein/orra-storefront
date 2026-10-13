import "server-only";

import { inArray, sql } from "drizzle-orm";

import { products } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import type { Transact } from "@/db/tx";
import { findCart, type CartRef } from "@/lib/bag/cart";
import { readBag } from "@/lib/bag/queries";
import type { Bag, BagLine } from "@/lib/bag/types";
import { PaymentsUnavailableError, type PaymentProvider } from "@/lib/payments/types";
import { createHold, findOpenHold, releaseExpiredHolds, releaseHold, takeStock, type HoldLine, type OpenHold } from "./holds";
import { allowCheckoutStart } from "./rate-limit";

/** Stripe won't let a session expire sooner than 30 minutes; the hold outlasts it by one. */
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

/** Closes a released hold's payment; a failure is logged and the payment expires with the hold. */
async function undoQuietly(deps: StartDeps, reference: string) {
  try {
    await deps.provider().undo(reference);
  } catch (error) {
    console.error("checkout: couldn't undo a released payment", error instanceof Error ? error.message : error);
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
 * 1. releases every lapsed hold, so their stock counts again (and an emptied bag's own hold);
 * 2. reads the bag at live stock; if that lowered a line, or a line has sold out with nothing
 *    left to buy, nothing is held and the shopper sees the updated bag first;
 * 3. reuses this bag's open hold when nothing changed (Stripe's idempotency key returns the same
 *    session, so the client secret is never stored);
 * 4. otherwise, within the rate limit, in one transaction: releases the bag's old hold, takes the
 *    stock all or nothing, and records the new hold; a short line rolls it all back;
 * 5. after the commit starts the payment, undoes the old hold's payment, and stores the reference.
 * Prices always come from the database.
 */
export async function startCheckoutWith(deps: StartDeps, { cart: ref, email, ip }: { cart: CartRef; email: string; ip: string | null }): Promise<StartResult> {
  const { db } = deps;
  const cart = await findCart(db, ref);
  if (!cart) return EMPTY;

  await releaseExpiredHolds(db);
  const bag = await readBag(db, cart.id);
  if (bag.lines.length === 0) {
    // An emptied bag gives back what it still held, and its payment can't go through.
    const stale = await findOpenHold(db, cart.id);
    if (stale && (await releaseHold(db, stale.id)) && stale.paymentReference) await undoQuietly(deps, stale.paymentReference);
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

  let checkoutId: string;
  let expiresAt: Date;
  let replaced: OpenHold | null = null;
  if (existing && sameHold(existing, email, lines)) {
    checkoutId = existing.id;
    expiresAt = existing.expiresAt;
  } else {
    if (deps.rateLimit && ip && !(await allowCheckoutStart(db, ip))) {
      return { ok: false, error: "invalid", reason: "rate-limited", message: "Too many checkouts started. Try again in a few minutes." };
    }
    expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);
    try {
      checkoutId = await deps.transact(async (tx) => {
        if (existing) await releaseHold(tx, existing.id);
        const taken = await takeStock(tx, lines);
        // Throwing rolls the transaction back: nothing is held.
        if (!taken.ok) throw new ShortStock(taken.short);
        return (await createHold(tx, { cartId: cart.id, userId: ref.userId, email, lines, expiresAt })).id;
      });
    } catch (error) {
      if (error instanceof ShortStock) {
        // Re-reading the bag lowers it to what's left.
        const updated = await readBag(db, cart.id);
        const byId = new Map(buyable.map((line, index) => [lines[index]!.productId, line]));
        return shortAnswer(
          updated,
          error.short.map(({ productId, available }) => ({ slug: byId.get(productId)!.slug, name: byId.get(productId)!.name, available })),
        );
      }
      // Another start for this bag won the race to the one open hold: use it if it matches.
      const winner = await findOpenHold(db, cart.id);
      if (!winner || !sameHold(winner, email, lines)) {
        console.error("checkout: couldn't hold the bag", error instanceof Error ? error.message : error);
        return FAILED;
      }
      checkoutId = winner.id;
      expiresAt = winner.expiresAt;
    }
    replaced = existing;
  }

  let payment: { reference: string; clientSecret: string };
  try {
    payment = await provider.startPayment({
      checkoutId,
      email,
      currency: "USD",
      expiresAt,
      returnUrl: `${deps.baseUrl}/checkout/success?checkout=${checkoutId}`,
      lines: lines.map((line, index) => ({ name: line.name, unitPrice: line.unitPrice, quantity: line.quantity, image: buyable[index]!.image?.src ?? null })),
    });
  } catch (error) {
    console.error("checkout: the payment didn't start", error instanceof Error ? error.message : error);
    await releaseHold(db, checkoutId);
    return FAILED;
  }
  await db.execute(sql`
    update checkouts set payment_provider = ${provider.name}, payment_reference = ${payment.reference}
    where id = ${checkoutId} and payment_reference is null`);
  // The old session mustn't stay payable; a failure here leaves it to expire with its hold.
  if (replaced?.paymentReference) await undoQuietly(deps, replaced.paymentReference);

  return { ok: true, data: { checkoutId, clientSecret: payment.clientSecret, expiresAt: expiresAt.toISOString(), summary: bag } };
}

class ShortStock extends Error {
  constructor(readonly short: { productId: number; available: number }[]) {
    super("short");
  }
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
