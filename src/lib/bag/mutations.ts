import "server-only";

import { sql } from "drizzle-orm";

import type { SeedDatabase } from "@/db/seed";
import { BAG_LINE_LIMIT, MAX_QUANTITY } from "./limits";
import { readBag, rowsOf } from "./queries";
import type { Bag } from "./types";

// Bag writes. Each change is one SQL statement (the Neon HTTP driver has no interactive
// transactions), so concurrent requests can't pass the per-line caps: never more than live stock
// or MAX_QUANTITY of one item. The BAG_LINE_LIMIT check reads the statement's snapshot, so adds of
// different products at the same moment can pass it by a line or two; it only bounds how big a
// bag can grow. Prices never come from the client.

export class BagError extends Error {
  constructor(
    readonly code: "not-a-product" | "full",
    message: string,
  ) {
    super(message);
  }
}

export type BagChange = { bag: Bag; capped: boolean };

/**
 * Adds `quantity` of a product, summing with the line if it's already in the bag. `capped` is true
 * when less than asked was added (stock, MAX_QUANTITY, or sold out). The conflict update reads
 * stock through a scalar subquery on EXCLUDED.product_id: an ON CONFLICT update can't see the
 * INSERT … SELECT's source tables.
 */
export async function addLine(db: SeedDatabase, cartId: string, slug: string, quantity: number, { mode = "sum" }: { mode?: "sum" | "max" } = {}): Promise<BagChange> {
  // "max" (the one-time import of an old browser bag) keeps the larger quantity instead of adding,
  // so importing the same lines twice (two tabs) doesn't double them.
  const combined = mode === "max" ? sql`greatest(cart_items.quantity, excluded.quantity)` : sql`cart_items.quantity + excluded.quantity`;
  const [row] = rowsOf<{ product_id: number | null; stock: number | null; before: number | null; after: number | null }>(
    await db.execute(sql`
      with product as (select id, stock from products where slug = ${slug}),
      before as (select ci.quantity from cart_items ci join product p on ci.product_id = p.id where ci.cart_id = ${cartId}),
      touch as (update carts set updated_at = now() where id = ${cartId}),
      upsert as (
        insert into cart_items (cart_id, product_id, quantity)
        select ${cartId}, p.id, least(${quantity}, p.stock, ${MAX_QUANTITY}) from product p
        where p.stock > 0
          and (exists (select 1 from before) or (select count(*) from cart_items where cart_id = ${cartId}) < ${BAG_LINE_LIMIT})
        on conflict (cart_id, product_id) do update
          set quantity = least(${combined}, (select stock from products where id = excluded.product_id), ${MAX_QUANTITY})
        returning quantity
      )
      select (select id from product) as product_id, (select stock from product) as stock,
        (select quantity from before) as before, (select quantity from upsert) as after`),
  );
  if (row.product_id === null) throw new BagError("not-a-product", "That's not a product.");
  const stock = Number(row.stock);
  if (stock > 0 && row.after === null) throw new BagError("full", `Your bag is full (${BAG_LINE_LIMIT} items).`);
  const before = row.before === null ? 0 : Number(row.before);
  const after = row.after === null ? before : Number(row.after);
  const wanted = mode === "max" ? Math.max(before, quantity) : before + quantity;
  return { bag: await readBag(db, cartId), capped: after < wanted };
}

/** Sets a line's quantity, capped at stock and MAX_QUANTITY. A sold-out line is left as it is. */
export async function setLineQuantity(db: SeedDatabase, cartId: string, slug: string, quantity: number): Promise<BagChange> {
  const [row] = rowsOf<{ after: number | null }>(
    await db.execute(sql`
      with touch as (update carts set updated_at = now() where id = ${cartId}),
      updated as (
        update cart_items ci set quantity = least(${quantity}, p.stock, ${MAX_QUANTITY})
        from products p
        where ci.cart_id = ${cartId} and ci.product_id = p.id and p.slug = ${slug} and p.stock > 0
        returning ci.quantity
      )
      select (select quantity from updated) as after`),
  );
  return { bag: await readBag(db, cartId), capped: row.after !== null && Number(row.after) < quantity };
}

export async function removeLine(db: SeedDatabase, cartId: string, slug: string): Promise<BagChange> {
  await db.execute(sql`
    delete from cart_items ci using products p
    where ci.cart_id = ${cartId} and ci.product_id = p.id and p.slug = ${slug}`);
  return { bag: await readBag(db, cartId), capped: false };
}
