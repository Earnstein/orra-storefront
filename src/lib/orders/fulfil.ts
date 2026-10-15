import "server-only";

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import type { SeedDatabase } from "@/db/seed";
import type { Transact } from "@/db/tx";
import { rowsOf } from "@/lib/bag/queries";
import { deliveryWindow } from "@/lib/catalog/delivery";
import type { Email, SendOptions } from "@/lib/email/send";
import { orderConfirmationEmail } from "@/lib/email/templates";
import { releaseHold, takeStock } from "@/lib/checkout/holds";
import type { PaymentProvider } from "@/lib/payments/types";
import { guestOrderKey, hashGuestKey } from "./guest-key";
import { readOrderByCheckout, readOrderById, type Order } from "./queries";

export type FulfilDeps = {
  db: SeedDatabase;
  transact: Transact;
  provider: PaymentProvider;
  /** The site's origin, for the email's link to the order. */
  baseUrl: string;
  /** Derives guests' order keys (see guestOrderKey). */
  secret: string;
  send: (email: Email, options: SendOptions) => Promise<{ ok: boolean }>;
  /** Runs work once the response is sent (Next's `after()`); tests collect and await it. */
  defer: (task: () => Promise<void>) => void;
};

export type FulfilResult =
  | { status: "confirmed"; order: Order }
  | { status: "pending" }
  | { status: "failed" }
  | { status: "sold-out"; items: string[] };

const PENDING = { status: "pending" } as const;
const FAILED = { status: "failed" } as const;

type CheckoutRow = {
  id: string;
  cart_id: string | null;
  user_id: string | null;
  email: string;
  status: "open" | "fulfilled" | "expired" | "cancelled";
  amount: number;
  currency: string;
  payment_provider: string | null;
  payment_reference: string | null;
};

async function readCheckout(db: SeedDatabase, checkoutId: string, lock = false): Promise<CheckoutRow | null> {
  const [row] = rowsOf<CheckoutRow>(
    await db.execute(sql`
      select id, cart_id, user_id, email, status, amount, currency, payment_provider, payment_reference
      from checkouts where id = ${checkoutId} ${lock ? sql`for update` : sql``}`),
  );
  return row ? { ...row, amount: Number(row.amount) } : null;
}

/**
 * Turns a paid hold into an order. Safe to call twice or at the same moment (the webhook and the
 * success page both call it), in the spec's order:
 * 1. a fulfilled checkout finishes its order (captures one left in `pending_capture`; repeats the
 *    undo of a cancelled one); a cancelled checkout repeats its undo;
 * 2. `verify` the payment: not authorised changes nothing;
 * 3. an amount or currency that differs from the hold's is undone, never fulfilled;
 * 4. in one transaction with the checkout row locked: an open hold (run out or not, its stock is
 *    still held) becomes an order; a released one takes its stock again, or is cancelled when
 *    the stock has gone;
 * 5. after the commit: capture, then mark the order `paid` (a failed capture puts the stock back,
 *    cancels the order and undoes the payment); the confirmation email goes out after the response.
 */
export async function fulfil(deps: FulfilDeps, checkoutId: string): Promise<FulfilResult> {
  const checkout = await readCheckout(deps.db, checkoutId);
  if (!checkout) return FAILED;
  const reference = checkout.payment_reference;
  if (!reference) return checkout.status === "open" ? PENDING : FAILED;
  if (checkout.status === "fulfilled") return finish(deps, checkoutId);
  if (checkout.status === "cancelled") return soldOutAgain(deps, checkout, reference);

  const payment = await deps.provider.verify(reference);
  if (payment.status === "pending") return PENDING;
  if (payment.status !== "authorised" && payment.status !== "paid") return FAILED;
  if (payment.amount !== checkout.amount || payment.currency.toUpperCase() !== checkout.currency.toUpperCase()) {
    console.error("orders: the payment doesn't match its hold; undoing it", checkoutId, { authorised: payment.amount, held: checkout.amount, currency: payment.currency });
    await deps.provider.undo(reference);
    await releaseHold(deps.db, checkoutId);
    return FAILED;
  }

  const orderId = randomUUID();
  const outcome = await deps.transact(async (tx): Promise<{ kind: "created" | "already" } | { kind: "sold-out"; short: number[] }> => {
    const locked = await readCheckout(tx, checkoutId, true);
    if (!locked || locked.status === "fulfilled" || locked.status === "cancelled") return { kind: "already" };
    if (locked.status === "expired") {
      // The hold was released (its time ran out): take the stock again, all or nothing.
      const lines = rowsOf<{ product_id: number; quantity: number }>(await tx.execute(sql`select product_id, quantity from checkout_items where checkout_id = ${checkoutId}`));
      const short = await tx
        .transaction(async (savepoint) => {
          const taken = await takeStock(
            savepoint,
            lines.map((line) => ({ productId: Number(line.product_id), quantity: Number(line.quantity) })),
          );
          if (!taken.ok) throw new ShortStock(taken.short.map((line) => line.productId));
          return null;
        })
        .catch((error: unknown) => {
          if (error instanceof ShortStock) return error.productIds;
          throw error;
        });
      if (short) {
        await tx.execute(sql`update checkouts set status = 'cancelled' where id = ${checkoutId}`);
        return { kind: "sold-out", short };
      }
    }
    await createOrder(tx, deps, { orderId, checkout: locked, summary: payment.summary, shipping: payment.shipping });
    return { kind: "created" };
  });

  if (outcome.kind === "sold-out") {
    // No money is taken: the authorisation is cancelled. A later call repeats this if it fails.
    await undoQuietly(deps, reference);
    return { status: "sold-out", items: await itemNames(deps.db, checkoutId, outcome.short) };
  }
  // Another call fulfilled or cancelled it first: answer as that call did (step 1 again).
  if (outcome.kind === "already") return fulfil(deps, checkoutId);
  return finish(deps, checkoutId);
}

/** Records the order and its lines, marks the hold fulfilled and takes the bought lines out of the bag. */
async function createOrder(
  tx: SeedDatabase,
  deps: FulfilDeps,
  { orderId, checkout, summary, shipping }: { orderId: string; checkout: CheckoutRow; summary: string | null; shipping: Order["shipping"] },
) {
  const guestKeyHash = checkout.user_id ? null : hashGuestKey(guestOrderKey(deps.secret, orderId));
  await tx.execute(sql`
    insert into orders (id, checkout_id, user_id, email, subtotal, currency, shipping, payment_provider, payment_reference, payment_summary, guest_key_hash)
    values (${orderId}, ${checkout.id}, ${checkout.user_id}, ${checkout.email}, ${checkout.amount}, ${checkout.currency},
      ${shipping ? JSON.stringify(shipping) : null}::jsonb, ${checkout.payment_provider ?? deps.provider.name}, ${checkout.payment_reference},
      ${summary}, ${guestKeyHash})`);
  await tx.execute(sql`
    insert into order_items (order_id, product_id, name, unit_price, quantity, image)
    select ${orderId}::uuid, i.product_id, i.name, i.unit_price, i.quantity, p.images -> 0
    from checkout_items i left join products p on p.id = i.product_id
    where i.checkout_id = ${checkout.id}
    order by i.product_id`);
  await tx.execute(sql`update checkouts set status = 'fulfilled' where id = ${checkout.id}`);
  if (checkout.cart_id) {
    // The bag may have gained more of an item since the hold (another tab): only what was bought goes.
    await tx.execute(sql`
      delete from cart_items c using checkout_items i
      where i.checkout_id = ${checkout.id} and c.cart_id = ${checkout.cart_id} and c.product_id = i.product_id and c.quantity <= i.quantity`);
    await tx.execute(sql`
      update cart_items c set quantity = c.quantity - i.quantity
      from checkout_items i
      where i.checkout_id = ${checkout.id} and c.cart_id = ${checkout.cart_id} and c.product_id = i.product_id`);
  }
}

/** A fulfilled checkout's order: captured (if an earlier call stopped before), then confirmed. */
async function finish(deps: FulfilDeps, checkoutId: string): Promise<FulfilResult> {
  const order = await readOrderByCheckout(deps.db, checkoutId);
  if (!order) return FAILED;
  if (order.status === "pending_capture") {
    try {
      await deps.provider.settle(order.paymentReference);
    } catch (error) {
      // Another call may have captured it a moment ago; only a payment that really wasn't taken is cancelled.
      const paid = await deps.provider
        .verify(order.paymentReference)
        .then((check) => check.status === "paid")
        .catch(() => false);
      if (!paid) {
        console.error("orders: the capture failed; cancelling the order", order.number, error instanceof Error ? error.message : error);
        await cancelOrder(deps.db, order.id);
        await undoQuietly(deps, order.paymentReference);
        return FAILED;
      }
    }
    await deps.db.execute(sql`update orders set status = 'paid' where id = ${order.id} and status = 'pending_capture'`);
    order.status = "paid";
  }
  if (order.status === "cancelled") {
    await undoIfAuthorised(deps, order.paymentReference);
    return FAILED;
  }
  deps.defer(() => sendOrderConfirmation(deps, order.id));
  return { status: "confirmed", order };
}

/** Puts a cancelled order's stock back, once (only the call that moves it out of `pending_capture`). */
async function cancelOrder(db: SeedDatabase, orderId: string) {
  await db.execute(sql`
    with cancelled as (
      update orders set status = 'cancelled' where id = ${orderId} and status = 'pending_capture' returning id
    )
    update products p set stock = p.stock + r.quantity
    from (
      select i.product_id, sum(i.quantity)::int as quantity
      from order_items i join cancelled on cancelled.id = i.order_id
      where i.product_id is not null
      group by i.product_id
    ) r
    where p.id = r.product_id`);
}

/** A checkout cancelled because its stock sold while the shopper paid: make sure the money isn't held. */
async function soldOutAgain(deps: FulfilDeps, checkout: CheckoutRow, reference: string): Promise<FulfilResult> {
  await undoIfAuthorised(deps, reference);
  return { status: "sold-out", items: await itemNames(deps.db, checkout.id, null) };
}

/**
 * The names of the lines that sold out, for "Sorry — the Leather tote sold out while you were
 * paying". A later call doesn't know which lines were short, so it names those short now (or all).
 */
async function itemNames(db: SeedDatabase, checkoutId: string, short: number[] | null): Promise<string[]> {
  const rows = rowsOf<{ product_id: number; name: string; short_now: boolean }>(
    await db.execute(sql`
      select i.product_id, i.name, coalesce(p.stock < i.quantity, true) as short_now
      from checkout_items i left join products p on p.id = i.product_id
      where i.checkout_id = ${checkoutId} order by i.product_id`),
  );
  const named = short ? rows.filter((row) => short.includes(Number(row.product_id))) : rows.filter((row) => row.short_now);
  return (named.length > 0 ? named : rows).map((row) => row.name);
}

async function undoQuietly(deps: FulfilDeps, reference: string) {
  try {
    await deps.provider.undo(reference);
  } catch (error) {
    // The next call (the webhook's retry, the success page) tries again while it's still authorised.
    console.error("orders: couldn't undo a payment", reference, error instanceof Error ? error.message : error);
  }
}

async function undoIfAuthorised(deps: FulfilDeps, reference: string) {
  try {
    const { status } = await deps.provider.verify(reference);
    if (status === "authorised" || status === "paid") await deps.provider.undo(reference);
  } catch (error) {
    console.error("orders: couldn't undo a payment", reference, error instanceof Error ? error.message : error);
  }
}

/** A claim on the email older than this was abandoned (a cut-off function) and can be taken over. */
const EMAIL_CLAIM = sql.raw("interval '10 minutes'");

/**
 * Sends a paid order's confirmation once: claim it (only one sender at a time; an abandoned claim
 * lapses), send with an idempotency key, then record it, or clear the claim so a later call retries.
 */
export async function sendOrderConfirmation(deps: Pick<FulfilDeps, "db" | "baseUrl" | "secret" | "send">, orderId: string): Promise<void> {
  const claimed = rowsOf<{ id: string }>(
    await deps.db.execute(sql`
      update orders set email_attempted_at = now()
      where id = ${orderId} and status = 'paid' and email_sent_at is null
        and (email_attempted_at is null or email_attempted_at < now() - ${EMAIL_CLAIM})
      returning id`),
  );
  if (claimed.length === 0) return;
  let sent = false;
  try {
    const order = await readOrderById(deps.db, orderId);
    if (!order) return;
    const url = order.userId
      ? `${deps.baseUrl}/account/orders/${order.number}`
      : `${deps.baseUrl}/orders/${order.number}?key=${guestOrderKey(deps.secret, order.id)}`;
    const content = orderConfirmationEmail({
      number: order.number,
      items: order.items,
      subtotal: order.subtotal,
      shipping: order.shipping,
      delivery: deliveryWindow(order.createdAt),
      url,
    });
    ({ ok: sent } = await deps.send({ to: order.email, ...content }, { idempotencyKey: `order-confirmation/${order.id}` }));
  } catch (error) {
    console.error("orders: the confirmation email failed", orderId, error instanceof Error ? error.message : error);
  }
  await deps.db.execute(
    sent ? sql`update orders set email_sent_at = now() where id = ${orderId}` : sql`update orders set email_attempted_at = null where id = ${orderId} and email_sent_at is null`,
  );
}

class ShortStock extends Error {
  constructor(readonly productIds: number[]) {
    super("short");
  }
}
