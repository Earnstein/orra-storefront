import "server-only";

import { sql, type SQL } from "drizzle-orm";

import type { OrderShipping } from "@/db/schema/orders";
import type { SeedDatabase } from "@/db/seed";
import { ADMIN_PAGE_SIZE, type AdminOrderParams } from "@/lib/admin/table-params";
import { rowsOf } from "@/lib/bag/queries";
import { formatOrderNumber } from "@/lib/orders/number";
import { readOrder, type OrderStatus } from "@/lib/orders/queries";
import { maskOrder, maskOrderRow } from "./mask";
import { CANCEL_CLAIM_MINUTES } from "./mutations";
import type { AdminOrder, AdminOrderRow } from "./types";

/** `%` and `_` typed into the search match themselves, not any text. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (character) => `\\${character}`);
const iso = (value: string | Date) => new Date(value).toISOString();

/**
 * The search's condition: an order number ("ORR-10001", "10001", or its start) or, for the owner,
 * part of an email. A masked (demo) admin searches by number only, so a search can't tell whether
 * someone with a given email ordered.
 */
function searchCondition(q: string, masked: boolean): SQL | null {
  if (!q) return null;
  const digits = /^(?:orr-?)?(\d{1,9})$/i.exec(q)?.[1];
  const byNumber = digits ? sql`o.number::text like ${`${digits}%`}` : null;
  if (masked) return byNumber ?? sql`false`;
  const byEmail = sql`o.email ilike ${`%${escapeLike(q)}%`}`;
  return byNumber ? sql`(${byNumber} or ${byEmail})` : byEmail;
}

/**
 * One page (ADMIN_PAGE_SIZE) of every order, newest first, with the total. Uncached; pages past the
 * end are clamped. `masked` (the demo admin) masks names and emails before they leave the server.
 */
export async function listAdminOrders(
  db: SeedDatabase,
  params: AdminOrderParams,
  { masked }: { masked: boolean },
): Promise<{ rows: AdminOrderRow[]; total: number; page: number }> {
  const conditions: SQL[] = [];
  const search = searchCondition(params.q.trim().slice(0, 100), masked);
  if (search) conditions.push(search);
  if (params.status !== "all") conditions.push(sql`o.status = ${params.status}`);
  const where = conditions.length > 0 ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;

  const [{ total }] = rowsOf<{ total: number }>(await db.execute(sql`select count(*)::int as total from orders o ${where}`));
  const pages = Math.max(1, Math.ceil(Number(total) / ADMIN_PAGE_SIZE));
  const page = Math.min(Math.max(1, params.page), pages);
  const rows = rowsOf<{ number: number; created_at: string | Date; name: string | null; email: string; status: OrderStatus; subtotal: number; item_count: number }>(
    await db.execute(sql`
      select o.number, o.created_at, o.shipping ->> 'name' as name, o.email, o.status, o.subtotal,
        (select coalesce(sum(i.quantity), 0)::int from order_items i where i.order_id = o.id) as item_count
      from orders o ${where}
      order by o.created_at desc, o.number desc
      limit ${ADMIN_PAGE_SIZE} offset ${(page - 1) * ADMIN_PAGE_SIZE}`),
  );
  const result = rows.map(
    (row): AdminOrderRow => ({
      number: formatOrderNumber(Number(row.number)),
      createdAt: iso(row.created_at),
      name: row.name,
      email: row.email,
      status: row.status,
      total: Number(row.subtotal),
      itemCount: Number(row.item_count),
    }),
  );
  return { rows: masked ? result.map(maskOrderRow) : result, total: Number(total), page };
}

/** One order for the admin's detail page (masked for the demo admin), or null. */
export async function getAdminOrder(db: SeedDatabase, number: number, { masked }: { masked: boolean }): Promise<AdminOrder | null> {
  const order = await readOrder(db, sql`number = ${number}`);
  if (!order) return null;
  const cancelled = order.status === "cancelled";
  const full: AdminOrder = {
    id: order.id,
    number: order.number,
    status: order.status,
    createdAt: iso(order.createdAt),
    fulfilledAt: order.fulfilledAt && iso(order.fulfilledAt),
    cancelledAt: cancelled && order.cancelledAt ? iso(order.cancelledAt) : null,
    refunded: order.refundedAt !== null,
    cancelling: order.status === "paid" && order.cancelledAt !== null && Date.now() - order.cancelledAt.getTime() < CANCEL_CLAIM_MINUTES * 60_000,
    account: order.userId !== null,
    subtotal: order.subtotal,
    currency: order.currency,
    paymentSummary: order.paymentSummary,
    items: order.items,
    masked: false,
    email: order.email,
    shipping: order.shipping as OrderShipping | null,
  };
  return masked ? maskOrder(full) : full;
}
