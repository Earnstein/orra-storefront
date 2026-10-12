import { check, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { user } from "./auth";
import { products } from "./catalog";

/**
 * A bag. `user_id` is null for a guest's bag (found through the signed `__Host-orra_cart` cookie)
 * and unique otherwise, so a signed-in shopper has one bag on every device. Deleting the user
 * deletes it; on sign-in a guest bag is merged into the user's and deleted.
 */
export const carts = pgTable("carts", {
  id: uuid().primaryKey().defaultRandom(),
  userId: text()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * One line per product in a bag. The caps (MAX_QUANTITY per line, live stock, BAG_LINE_LIMIT
 * lines) are kept by the bag's single-statement mutations.
 */
export const cartItems = pgTable(
  "cart_items",
  {
    cartId: uuid()
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: integer()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer().notNull(),
    addedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.cartId, t.productId] }), check("cart_items_quantity_positive", sql`${t.quantity} > 0`)],
);
