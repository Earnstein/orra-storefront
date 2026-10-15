import "server-only";

import { sql } from "drizzle-orm";

import type { OrderShipping } from "@/db/schema";
import type { ProductImage } from "@/db/schema/catalog";
import type { SeedDatabase } from "@/db/seed";
import { rowsOf } from "@/lib/bag/queries";
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
