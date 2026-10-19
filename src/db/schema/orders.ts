import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgSequence, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { products, type ProductImage } from "./catalog";
import { checkouts } from "./checkout";

/** Order numbers, shown as "ORR-10001". */
export const orderNumberSeq = pgSequence("order_number_seq", { startWith: 10001 });

/**
 * - `pending_capture`: the order is recorded and the money is authorised, not yet taken;
 * - `paid`: taken;
 * - `fulfilled`: paid and sent (M6's admin);
 * - `cancelled`: taking it failed (the authorisation was cancelled), or the owner cancelled a paid
 *   order (refunded, `refunded_at`); either way the stock went back.
 */
export const orderStatus = pgEnum("order_status", ["pending_capture", "paid", "cancelled", "fulfilled"]);

export type OrderShipping = {
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

/**
 * One order per paid checkout (`checkout_id` unique, so two fulfilments at once can't make two).
 * `user_id` is set null when the account goes, so the record stays. A guest's order link carries
 * a key; only its SHA-256 is stored (`guest_key_hash`). The confirmation email is claimed with
 * `email_attempted_at` and recorded with `email_sent_at`, so it goes out once and is retried after
 * a failure.
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey(),
    number: integer()
      .notNull()
      .unique()
      .default(sql`nextval('order_number_seq')`),
    checkoutId: uuid()
      .notNull()
      .unique()
      .references(() => checkouts.id),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    email: text().notNull(),
    status: orderStatus().notNull().default("pending_capture"),
    subtotal: integer().notNull(),
    currency: text().notNull(),
    shipping: jsonb().$type<OrderShipping>(),
    paymentProvider: text().notNull(),
    paymentReference: text().notNull().unique(),
    paymentSummary: text(),
    guestKeyHash: text(),
    emailAttemptedAt: timestamp({ withTimezone: true }),
    emailSentAt: timestamp({ withTimezone: true }),
    fulfilledAt: timestamp({ withTimezone: true }),
    /**
     * When it was cancelled. While the order is still `paid` it's the owner's cancel in progress
     * (the refund is being made): a fulfil waits for it, and a claim older than 10 minutes lapses.
     */
    cancelledAt: timestamp({ withTimezone: true }),
    /** Set when a cancel gave the money back (a paid order); a capture that failed took nothing. */
    refundedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.userId, t.createdAt.desc()),
    // The admin's list: every order, newest first.
    index().on(t.createdAt.desc()),
    check("orders_subtotal_nonnegative", sql`${t.subtotal} >= 0`),
  ],
);

/** A bought line, as it was at purchase (the product may change or go later). */
export const orderItems = pgTable(
  "order_items",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer().references(() => products.id, { onDelete: "set null" }),
    name: text().notNull(),
    unitPrice: integer().notNull(),
    quantity: integer().notNull(),
    image: jsonb().$type<ProductImage>(),
  },
  (t) => [index().on(t.orderId), check("order_items_quantity_positive", sql`${t.quantity} > 0`)],
);

/** Webhook events already handled (the provider's event id), so a repeated delivery is skipped. */
export const paymentEvents = pgTable("payment_events", {
  id: text().primaryKey(),
  provider: text().notNull(),
  receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
