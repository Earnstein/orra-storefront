import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import { cartItems, products } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import type { CatalogImage } from "@/lib/catalog/types";
import { MAX_QUANTITY } from "./limits";
import { availableTo } from "./stock";
import type { Bag, BagLine } from "./types";

/** Rows from `db.execute`, which both drivers (Neon HTTP and PGlite) return as `{ rows }`. */
export function rowsOf<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}

/**
 * The bag with live stock (not the catalogue cache). A line above stock is lowered in the same
 * request and marked "reduced"; a line with no stock stays, marked "sold-out" and left out of the
 * count and subtotal. Newest lines first.
 */
export async function readBag(db: SeedDatabase, cartId: string): Promise<Bag> {
  const available = availableTo(cartId, sql.raw("p"));
  const reduced = rowsOf<{ product_id: number }>(
    await db.execute(sql`
      update cart_items ci set quantity = least(${available}, ${MAX_QUANTITY})
      from products p
      where ci.cart_id = ${cartId} and ci.product_id = p.id and ${available} > 0 and ci.quantity > least(${available}, ${MAX_QUANTITY})
      returning ci.product_id`),
  );
  const lowered = new Set(reduced.map((row) => Number(row.product_id)));

  const rows = await db
    .select({
      productId: products.id,
      slug: products.slug,
      name: products.name,
      colour: products.colour,
      unitPrice: products.price,
      image: sql<CatalogImage | null>`${products.images} -> 0`,
      stock: availableTo(cartId, sql.raw(`"products"`)),
      quantity: cartItems.quantity,
    })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(desc(cartItems.addedAt), products.id);

  const lines: BagLine[] = rows.map(({ productId, ...line }) => ({
    ...line,
    note: line.stock === 0 ? "sold-out" : lowered.has(productId) ? "reduced" : null,
  }));
  const buyable = lines.filter((line) => line.note !== "sold-out");
  return {
    lines,
    count: buyable.reduce((total, line) => total + line.quantity, 0),
    subtotal: buyable.reduce((total, line) => total + line.quantity * line.unitPrice, 0),
    currency: "USD",
  };
}
