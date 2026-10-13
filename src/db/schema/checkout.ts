import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { carts } from "./cart";
import { products } from "./catalog";

export const checkoutStatus = pgEnum("checkout_status", ["open", "fulfilled", "expired", "cancelled"]);

/**
 * A stock hold: the bag's lines taken out of stock while the shopper pays, for 31 minutes
 * (`expires_at`). `open` until it's paid (`fulfilled`), runs out or is released (`expired`), or is
 * undone after a lapse (`cancelled`). Prices and names are copied at the time of the hold.
 *
 * `cart_id` and `user_id` are set null when the bag or account goes (a guest bag is deleted when
 * it merges on sign-in), so the hold is still released and its stock returned. One open hold per
 * bag, enforced by a partial unique index, so two starts at once can't take stock twice.
 */
export const checkouts = pgTable(
  "checkouts",
  {
    id: uuid().primaryKey().defaultRandom(),
    cartId: uuid().references(() => carts.id, { onDelete: "set null" }),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    email: text().notNull(),
    status: checkoutStatus().notNull().default("open"),
    amount: integer().notNull(),
    currency: text().notNull().default("USD"),
    paymentProvider: text(),
    // Set once the payment starts (after the hold commits).
    paymentReference: text().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.status, t.expiresAt),
    uniqueIndex("checkouts_one_open_per_cart").on(t.cartId).where(sql`${t.status} = 'open'`),
    check("checkouts_amount_nonnegative", sql`${t.amount} >= 0`),
  ],
);

/**
 * A held line. The product can't be deleted while a checkout refers to it (M6 should archive
 * products instead), so a release can always return its stock.
 */
export const checkoutItems = pgTable(
  "checkout_items",
  {
    checkoutId: uuid()
      .notNull()
      .references(() => checkouts.id, { onDelete: "cascade" }),
    productId: integer()
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    name: text().notNull(),
    unitPrice: integer().notNull(),
    quantity: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.checkoutId, t.productId] }), check("checkout_items_quantity_positive", sql`${t.quantity} > 0`)],
);
