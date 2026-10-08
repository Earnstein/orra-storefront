import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { products } from "./catalog";

/**
 * Products a signed-in shopper saved, one row per user and product. Deleting the user or the
 * product deletes its rows. The cap (SAVED_LIMIT, 200 per account) is kept by the mutations.
 */
export const savedItems = pgTable(
  "saved_items",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    productId: integer()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] }), index("saved_items_user_created_idx").on(t.userId, t.createdAt.desc())],
);
