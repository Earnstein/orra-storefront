import { sql, type SQL } from "drizzle-orm";

/**
 * Stock as one bag sees it: the product's stock plus what open holds have taken out of it that
 * this bag may count: its own (without it, a shopper holding 2 of 3 would see their own line
 * lowered to the 1 left, on /bag in another tab or when adding one more) and any that have run
 * out but haven't been swept yet (they're only swept when a checkout starts, so a product held in
 * full would otherwise read as sold out until then). `product` names the products row in the
 * surrounding query (e.g. `sql.raw("p")`).
 */
export function availableTo(cartId: string, product: SQL): SQL<number> {
  return sql<number>`(${product}.stock + coalesce((
    select sum(h.quantity) from checkout_items h join checkouts c on c.id = h.checkout_id
    where c.status = 'open' and (c.cart_id = ${cartId} or c.expires_at < now()) and h.product_id = ${product}.id
  ), 0))::int`;
}
