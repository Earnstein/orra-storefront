import "server-only";

import { sql } from "drizzle-orm";

import type { OrderShipping } from "@/db/schema";
import type { ProductImage } from "@/db/schema/catalog";
import type { SeedDatabase } from "@/db/seed";
import { rowsOf } from "@/lib/bag/queries";
import { guestKeyMatches } from "./guest-key";
import { formatOrderNumber } from "./number";

export type OrderStatus = "pending_capture" | "paid" | "cancelled";

export type OrderItem = { productId: number | null; name: string; unitPrice: number; quantity: number; image: ProductImage | null };

export type Order = {
  id: string;
  /** "ORR-10001" */
  number: string;
  checkoutId: string;
  userId: string | null;
  email: string;
  status: OrderStatus;
  subtotal: number;
  currency: string;
  shipping: OrderShipping | null;
  paymentReference: string;
  paymentSummary: string | null;
  createdAt: Date;
  items: OrderItem[];
};

type OrderRow = {
  id: string;
  number: number;
  checkout_id: string;
  user_id: string | null;
  email: string;
  status: OrderStatus;
  subtotal: number;
  currency: string;
  shipping: OrderShipping | string | null;
  payment_reference: string;
  payment_summary: string | null;
  created_at: string | Date;
};

type ItemRow = { product_id: number | null; name: string; unit_price: number; quantity: number; image: ProductImage | string | null };

/** JSON columns come back parsed from PGlite and as text from some drivers. */
const json = <T>(value: T | string | null): T | null => (typeof value === "string" ? (JSON.parse(value) as T) : value);

async function readOrder(db: SeedDatabase, where: ReturnType<typeof sql>): Promise<Order | null> {
  const [row] = rowsOf<OrderRow>(
    await db.execute(sql`
      select id, number, checkout_id, user_id, email, status, subtotal, currency, shipping, payment_reference, payment_summary, created_at
      from orders where ${where}`),
  );
  if (!row) return null;
  const items = rowsOf<ItemRow>(await db.execute(sql`select product_id, name, unit_price, quantity, image from order_items where order_id = ${row.id} order by id`));
  return {
    id: row.id,
    number: formatOrderNumber(Number(row.number)),
    checkoutId: row.checkout_id,
    userId: row.user_id,
    email: row.email,
    status: row.status,
    subtotal: Number(row.subtotal),
    currency: row.currency,
    shipping: json(row.shipping),
    paymentReference: row.payment_reference,
    paymentSummary: row.payment_summary,
    createdAt: new Date(row.created_at),
    items: items.map((item) => ({
      productId: item.product_id === null ? null : Number(item.product_id),
      name: item.name,
      unitPrice: Number(item.unit_price),
      quantity: Number(item.quantity),
      image: json(item.image),
    })),
  };
}

/** The order a checkout became, with its items; null before it's recorded. */
export function readOrderByCheckout(db: SeedDatabase, checkoutId: string): Promise<Order | null> {
  return readOrder(db, sql`checkout_id = ${checkoutId}`);
}

export function readOrderById(db: SeedDatabase, orderId: string): Promise<Order | null> {
  return readOrder(db, sql`id = ${orderId}`);
}

/** A user's order with this number ("ORR-10001" → 10001); null when there's none or it's another user's. */
export function getOrderForUser(db: SeedDatabase, userId: string, number: number): Promise<Order | null> {
  return readOrder(db, sql`number = ${number} and user_id = ${userId}`);
}

/**
 * A guest's order, for the link in their email (`/orders/ORR-10001?key=…`): only when the key's
 * hash matches the stored one, compared in constant time. Orders placed signed in have no key.
 */
export async function getOrderForGuestKey(db: SeedDatabase, number: number, key: string | null): Promise<Order | null> {
  if (!key) return null;
  const [row] = rowsOf<{ id: string; guest_key_hash: string | null }>(await db.execute(sql`select id, guest_key_hash from orders where number = ${number}`));
  if (!row || !guestKeyMatches(key, row.guest_key_hash)) return null;
  return readOrderById(db, row.id);
}

/** A line in the account's order list. */
export type OrderListItem = {
  number: string;
  status: OrderStatus;
  subtotal: number;
  createdAt: Date;
  itemCount: number;
  /** Up to the first four items' photos. */
  images: ProductImage[];
};

/** How many orders the account's list shows (paging can come with M6's admin). */
export const ORDER_LIST_LIMIT = 100;

/** A user's orders, newest first, each with its item count and first photos. */
export async function getOrdersForUser(db: SeedDatabase, userId: string): Promise<OrderListItem[]> {
  const rows = rowsOf<{ number: number; status: OrderStatus; subtotal: number; created_at: string | Date; item_count: number; images: ProductImage[] | string }>(
    await db.execute(sql`
      select o.number, o.status, o.subtotal, o.created_at,
        (select coalesce(sum(i.quantity), 0)::int from order_items i where i.order_id = o.id) as item_count,
        (select coalesce(json_agg(x.image order by x.id), '[]'::json)
           from (select i.id, i.image from order_items i where i.order_id = o.id and i.image is not null order by i.id limit 4) x) as images
      from orders o
      where o.user_id = ${userId}
      order by o.created_at desc, o.number desc
      limit ${ORDER_LIST_LIMIT}`),
  );
  return rows.map((row) => ({
    number: formatOrderNumber(Number(row.number)),
    status: row.status,
    subtotal: Number(row.subtotal),
    createdAt: new Date(row.created_at),
    itemCount: Number(row.item_count),
    images: json(row.images) ?? [],
  }));
}

export async function countOrdersForUser(db: SeedDatabase, userId: string): Promise<number> {
  const [row] = rowsOf<{ count: number }>(await db.execute(sql`select count(*)::int as count from orders where user_id = ${userId}`));
  return Number(row?.count ?? 0);
}
