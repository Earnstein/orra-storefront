import "server-only";

import { sql } from "drizzle-orm";

import type { SeedDatabase } from "@/db/seed";
import type { CatalogImage } from "@/lib/catalog/types";
import { MAX_QUANTITY } from "./limits";
import { availableTo } from "./stock";
import { isBuyable, type Bag, type BagLine } from "./types";

/** Rows from `db.execute`, which both drivers (Neon HTTP and PGlite) return as `{ rows }`. */
export function rowsOf<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}

/**
 * The bag with live stock (not the catalogue cache). A line above stock is lowered in the same
 * request and marked "reduced"; a line with no stock stays, marked "sold-out" (or "unavailable"
 * when the product was archived) and left out of the count and subtotal. Newest lines first. One statement (each is a round trip to Neon): the
 * lowering runs in a CTE, and the read takes each lowered line's new quantity from it, since the
 * statement's snapshot still holds the old one.
 */
export async function readBag(db: SeedDatabase, cartId: string): Promise<Bag> {
  const available = availableTo(cartId, sql.raw("p"));
  const rows = rowsOf<{
    product_id: number;
    slug: string;
    name: string;
    colour: string;
    unit_price: number;
    image: CatalogImage | string | null;
    stock: number;
    quantity: number;
    reduced: boolean;
    archived: boolean;
  }>(
    await db.execute(sql`
      with reduced as (
        update cart_items ci set quantity = least(${available}, ${MAX_QUANTITY})
        from products p
        where ci.cart_id = ${cartId} and ci.product_id = p.id and ${available} > 0 and ci.quantity > least(${available}, ${MAX_QUANTITY})
        returning ci.product_id, ci.quantity
      )
      select p.id as product_id, p.slug, p.name, p.colour, p.price as unit_price, p.images -> 0 as image, ${available} as stock,
        coalesce(r.quantity, ci.quantity) as quantity, r.product_id is not null as reduced,
        p.archived_at is not null as archived
      from cart_items ci
      join products p on p.id = ci.product_id
      left join reduced r on r.product_id = ci.product_id
      where ci.cart_id = ${cartId}
      order by ci.added_at desc, p.id`),
  );

  const lines: BagLine[] = rows.map((row) => {
    const stock = Number(row.stock);
    return {
      slug: row.slug,
      name: row.name,
      colour: row.colour,
      unitPrice: Number(row.unit_price),
      // JSON comes back parsed from PGlite and Neon, as text from some drivers.
      image: typeof row.image === "string" ? (JSON.parse(row.image) as CatalogImage) : row.image,
      stock,
      quantity: Number(row.quantity),
      note: row.archived ? "unavailable" : stock === 0 ? "sold-out" : row.reduced ? "reduced" : null,
    };
  });
  const buyable = lines.filter(isBuyable);
  return {
    lines,
    count: buyable.reduce((total, line) => total + line.quantity, 0),
    subtotal: buyable.reduce((total, line) => total + line.quantity * line.unitPrice, 0),
    currency: "USD",
  };
}
