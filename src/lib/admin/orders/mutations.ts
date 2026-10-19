import "server-only";

import { sql } from "drizzle-orm";

import type { SeedDatabase } from "@/db/seed";
import { rowsOf } from "@/lib/bag/queries";
import type { OrderStatus } from "@/lib/orders/queries";
import type { PaymentProvider } from "@/lib/payments/types";
import type { OrderResult } from "./types";

export type OrderDeps = { db: SeedDatabase; provider: PaymentProvider };

const DONE = { ok: true, data: null } as const;
const NOT_FOUND = { ok: false, error: "not-found", message: "This order no longer exists." } as const;

/** A cancel claimed longer ago than this was cut off (a function stopped mid-refund) and can be retried. */
export const CANCEL_CLAIM_MINUTES = 10;
const claimLive = sql`cancelled_at is not null and cancelled_at >= now() - ${sql.raw(`interval '${CANCEL_CLAIM_MINUTES} minutes'`)}`;

/** Why an order can't be fulfilled or cancelled now, from what it is. */
async function refusal(db: SeedDatabase, orderId: string, action: "fulfil" | "cancel"): Promise<OrderResult> {
  const [order] = rowsOf<{ status: OrderStatus; cancelling: boolean; cut_off: boolean }>(
    await db.execute(sql`select status, (${claimLive}) as cancelling, (cancelled_at is not null and not (${claimLive})) as cut_off from orders where id = ${orderId}`),
  );
  if (!order) return NOT_FOUND;
  const invalid = (message: string): OrderResult => ({ ok: false, error: "invalid", message });
  switch (order.status) {
    case "pending_capture":
      return invalid("This order's payment is still being confirmed. Try again in a minute.");
    case "fulfilled":
      return invalid(action === "fulfil" ? "This order is already fulfilled." : "A fulfilled order can't be cancelled.");
    case "cancelled":
      return invalid(action === "fulfil" ? "A cancelled order can't be fulfilled." : "This order is already cancelled.");
    case "paid":
      if (order.cancelling) return invalid("This order is being cancelled.");
      if (order.cut_off) return invalid("A cancel of this order didn't finish. Cancel it again to complete the refund.");
      return { ok: false, error: "failed", message: "Something went wrong. Try again." };
  }
}

/**
 * Marks a paid order as sent. Only `paid` orders with no cancel started: a cancel that was cut
 * off may already have refunded the money, so it has to be finished (cancel again), not shipped.
 */
export async function fulfilOrder({ db }: Pick<OrderDeps, "db">, orderId: string): Promise<OrderResult> {
  const updated = rowsOf<{ id: string }>(
    await db.execute(sql`
      update orders set status = 'fulfilled', fulfilled_at = now()
      where id = ${orderId} and status = 'paid' and cancelled_at is null
      returning id`),
  );
  return updated.length > 0 ? DONE : refusal(db, orderId, "fulfil");
}

/**
 * Cancels a paid order: claim it (so two cancels, or a cancel and a fulfil, can't both proceed),
 * refund through the provider, then in one statement mark it cancelled and put its stock back,
 * only if it's still paid, so the stock moves once (as fulfilment's capture-failure path does).
 * When the refund call fails, the provider says what happened: still paid releases the claim
 * (nothing changed); refunded after all finishes the cancel; unknown keeps the claim, so the order
 * can't be fulfilled, and cancelling again once it lapses retries (a refund already made isn't
 * repeated).
 */
export async function cancelOrder({ db, provider }: OrderDeps, orderId: string): Promise<OrderResult> {
  const [claimed] = rowsOf<{ payment_reference: string }>(
    await db.execute(sql`
      update orders set cancelled_at = now()
      where id = ${orderId} and status = 'paid' and not (${claimLive})
      returning payment_reference`),
  );
  if (!claimed) return refusal(db, orderId, "cancel");

  try {
    await provider.undo(claimed.payment_reference);
  } catch (error) {
    console.error("admin: the refund call failed", orderId, error instanceof Error ? error.message : error);
    // The refund may have gone through before the call failed: only the provider knows.
    const status = await provider
      .verify(claimed.payment_reference)
      .then((payment) => payment.status)
      .catch(() => null);
    if (status === "paid") {
      await db.execute(sql`update orders set cancelled_at = null where id = ${orderId} and status = 'paid'`);
      return { ok: false, error: "failed", message: "The refund didn't go through, so the order is still paid. Try again." };
    }
    if (status !== "failed") {
      // Unknown: keep the claim (nothing ships meanwhile); cancelling again after it lapses retries.
      return { ok: false, error: "failed", message: "We couldn't confirm the refund. Try cancelling again in 10 minutes." };
    }
    // Refunded after all: finish the cancel.
  }

  const [done] = rowsOf<{ cancelled: number }>(
    await db.execute(sql`
      with cancelled as (
        update orders set status = 'cancelled', cancelled_at = now(), refunded_at = now()
        where id = ${orderId} and status = 'paid' returning id
      ), restocked as (
        update products p set stock = p.stock + r.quantity
        from (
          select i.product_id, sum(i.quantity)::int as quantity
          from order_items i join cancelled on cancelled.id = i.order_id
          where i.product_id is not null
          group by i.product_id
        ) r
        where p.id = r.product_id
      )
      select count(*)::int as cancelled from cancelled`),
  );
  if (Number(done?.cancelled ?? 0) === 0) {
    console.error("admin: refunded, but the order was no longer paid", orderId);
    return refusal(db, orderId, "cancel");
  }
  return DONE;
}
