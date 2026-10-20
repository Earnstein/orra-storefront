import "server-only";

import { sql } from "drizzle-orm";

import type { OrderShipping } from "@/db/schema";
import type { ProductImage } from "@/db/schema/catalog";
import { findCart, type CartRef } from "@/lib/bag/cart";
import { readBag, rowsOf } from "@/lib/bag/queries";
import { fulfil, type FulfilDeps } from "@/lib/orders/fulfil";

/** What the success page shows of an order: no ids, references or keys. */
export type ConfirmedOrder = {
  number: string;
  email: string;
  items: { name: string; unitPrice: number; quantity: number; image: ProductImage | null }[];
  subtotal: number;
  shipping: OrderShipping | null;
  paymentSummary: string | null;
  createdAt: string;
};

export type ConfirmAnswer =
  | { status: "confirmed"; order: ConfirmedOrder; signedIn: boolean }
  | { status: "pending" | "failed" | "received" }
  | { status: "sold-out"; items: string[] }
  | { status: "refunded"; number: string };

/**
 * The success page's call: fulfils the shopper's own checkout (`fulfil` is safe to repeat, so the
 * webhook may have done it already) and answers what to show. Only the signed-in user who started
 * it, or the browser whose guest bag started it, sees the order; anyone else gets "received" and
 * nothing is done. `count` is the bag's new item count for the header's cookie (null when the
 * checkout isn't theirs).
 */
export async function confirmCheckoutWith(deps: FulfilDeps, { cart, checkoutId }: { cart: CartRef; checkoutId: string }): Promise<{ answer: ConfirmAnswer; count: number | null }> {
  const [checkout] = rowsOf<{ user_id: string | null; cart_id: string | null }>(
    await deps.db.execute(sql`select user_id, cart_id from checkouts where id = ${checkoutId}`),
  );
  const owner =
    checkout !== undefined &&
    (cart.userId ? checkout.user_id === cart.userId : checkout.user_id === null && cart.guestCartId !== null && checkout.cart_id === cart.guestCartId);
  if (!owner) return { answer: { status: "received" }, count: null };

  const result = await fulfil(deps, checkoutId);
  const own = await findCart(deps.db, cart);
  const count = own ? (await readBag(deps.db, own.id)).count : 0;
  if (result.status !== "confirmed") return { answer: result, count };
  const { order } = result;
  return {
    answer: {
      status: "confirmed",
      signedIn: cart.userId !== null,
      order: {
        number: order.number,
        email: order.email,
        items: order.items.map(({ name, unitPrice, quantity, image }) => ({ name, unitPrice, quantity, image })),
        subtotal: order.subtotal,
        shipping: order.shipping,
        paymentSummary: order.paymentSummary,
        createdAt: order.createdAt.toISOString(),
      },
    },
    count,
  };
}
