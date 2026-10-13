import { sql, type SQL } from "drizzle-orm";

/**
 * Stock as one bag sees it: the product's stock plus what this bag's own open hold has taken out
 * of it while the shopper pays. Without it, a shopper holding 2 of 3 would see their own line
 * lowered to the 1 left (on /bag in another tab, or when adding one more). `product` names the
 * products row in the surrounding query (e.g. `sql.raw("p")`).
 */
export function availableTo(cartId: string, product: SQL): SQL<number> {
  return sql<number>`(${product}.stock + coalesce((
    select sum(h.quantity) from checkout_items h join checkouts c on c.id = h.checkout_id
    where c.cart_id = ${cartId} and c.status = 'open' and h.product_id = ${product}.id
  ), 0))::int`;
}
