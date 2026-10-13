import "server-only";

import { sql } from "drizzle-orm";

import type { SeedDatabase } from "@/db/seed";
import { rowsOf } from "@/lib/bag/queries";

// Stock holds (the `checkouts` table). Taking stock and recording the hold happen in one
// transaction (src/db/tx.ts); releasing is one statement that marks the hold `expired` only if it
// is still `open` and returns its stock, so releasing twice (the sweep and the webhook at once)
// returns the stock once. Every function takes any Drizzle database, so tests run them on PGlite.

/** A line to hold, priced from the database (cents). */
export type HoldLine = { productId: number; name: string; unitPrice: number; quantity: number };

export type OpenHold = {
  id: string;
  email: string;
  amount: number;
  paymentReference: string | null;
  expiresAt: Date;
  lines: HoldLine[];
};

/**
 * Takes each line's quantity out of stock, only where enough is left (`stock >= quantity`, which
 * Postgres re-checks after waiting for a concurrent taker's row lock, so stock never goes below
 * zero). On any short line the caller must roll back; `available` is the stock left now.
 */
export async function takeStock(tx: SeedDatabase, lines: { productId: number; quantity: number }[]): Promise<{ ok: true } | { ok: false; short: { productId: number; available: number }[] }> {
  if (lines.length === 0) return { ok: true };
  const wanted = sql.join(
    lines.map((line) => sql`(${line.productId}::int, ${line.quantity}::int)`),
    sql`, `,
  );
  const taken = rowsOf<{ id: number }>(
    await tx.execute(sql`
      with wanted (product_id, quantity) as (values ${wanted})
      update products p set stock = p.stock - w.quantity
      from wanted w
      where p.id = w.product_id and p.stock >= w.quantity
      returning p.id`),
  );
  const done = new Set(taken.map((row) => Number(row.id)));
  const missing = lines.filter((line) => !done.has(line.productId)).map((line) => line.productId);
  if (missing.length === 0) return { ok: true };
  // A fresh statement sees what another shopper's committed hold left.
  const left = rowsOf<{ id: number; stock: number }>(
    await tx.execute(sql`select id, stock from products where id in (${sql.join(missing.map((id) => sql`${id}`), sql`, `)})`),
  );
  const stock = new Map(left.map((row) => [Number(row.id), Number(row.stock)]));
  return { ok: false, short: missing.map((productId) => ({ productId, available: stock.get(productId) ?? 0 })) };
}

/** Records an open hold and its lines (after `takeStock` succeeded in the same transaction). */
export async function createHold(
  tx: SeedDatabase,
  { cartId, userId, email, lines, expiresAt }: { cartId: string | null; userId: string | null; email: string; lines: HoldLine[]; expiresAt: Date },
): Promise<{ id: string }> {
  const amount = lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0);
  const [row] = rowsOf<{ id: string }>(
    await tx.execute(sql`
      insert into checkouts (cart_id, user_id, email, amount, expires_at)
      values (${cartId}, ${userId}, ${email}, ${amount}, ${expiresAt.toISOString()})
      returning id`),
  );
  const id = row!.id;
  if (lines.length > 0) {
    const values = sql.join(
      lines.map((line) => sql`(${id}::uuid, ${line.productId}::int, ${line.name}, ${line.unitPrice}::int, ${line.quantity}::int)`),
      sql`, `,
    );
    await tx.execute(sql`insert into checkout_items (checkout_id, product_id, name, unit_price, quantity) values ${values}`);
  }
  return { id };
}

/** This bag's open hold that hasn't run out, with its lines; null when there's none. */
export async function findOpenHold(db: SeedDatabase, cartId: string): Promise<OpenHold | null> {
  const rows = rowsOf<{
    id: string;
    email: string;
    amount: number;
    payment_reference: string | null;
    expires_at: string | Date;
    product_id: number;
    name: string;
    unit_price: number;
    quantity: number;
  }>(
    await db.execute(sql`
      select c.id, c.email, c.amount, c.payment_reference, c.expires_at, i.product_id, i.name, i.unit_price, i.quantity
      from checkouts c join checkout_items i on i.checkout_id = c.id
      where c.cart_id = ${cartId} and c.status = 'open' and c.expires_at > now()
      order by i.product_id`),
  );
  const [first] = rows;
  if (!first) return null;
  return {
    id: first.id,
    email: first.email,
    amount: Number(first.amount),
    paymentReference: first.payment_reference,
    expiresAt: new Date(first.expires_at),
    lines: rows.map((row) => ({ productId: Number(row.product_id), name: row.name, unitPrice: Number(row.unit_price), quantity: Number(row.quantity) })),
  };
}

/** Marks the matching open holds `expired` and returns their stock, in one statement. */
async function release(db: SeedDatabase, which: ReturnType<typeof sql>): Promise<number> {
  const [row] = rowsOf<{ released: number }>(
    await db.execute(sql`
      with released as (
        update checkouts set status = 'expired' where status = 'open' and ${which} returning id
      ),
      returned as (
        update products p set stock = p.stock + r.quantity
        from (
          select i.product_id, sum(i.quantity)::int as quantity
          from checkout_items i join released on released.id = i.checkout_id
          group by i.product_id
        ) r
        where p.id = r.product_id
      )
      select count(*)::int as released from released`),
  );
  return Number(row?.released ?? 0);
}

/** Releases every open hold whose time has run out; answers how many. */
export function releaseExpiredHolds(db: SeedDatabase): Promise<number> {
  return release(db, sql`expires_at < now()`);
}

/** Releases one hold if it's still open; false when it was already released, paid or cancelled. */
export async function releaseHold(db: SeedDatabase, checkoutId: string): Promise<boolean> {
  return (await release(db, sql`id = ${checkoutId}`)) > 0;
}

/** Releases a guest bag's open holds (when it merges into an account on sign-in); answers how many. */
export function releaseGuestHolds(db: SeedDatabase, cartId: string): Promise<number> {
  return release(db, sql`cart_id = ${cartId} and cart_id in (select id from carts where user_id is null)`);
}
