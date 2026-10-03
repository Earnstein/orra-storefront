import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Catalogue: categories and products. Stock is a column on products (no variants or
// warehouses yet, so a product has exactly one stock figure).

export const categories = pgTable("categories", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type ProductImage = { src: string; alt: string };
export type ProductDetail = { term: string; value: string };

export const products = pgTable(
  "products",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** Public key: used in URLs and by the browser bag. */
    slug: text().notNull().unique(),
    name: text().notNull(),
    categoryId: integer()
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    /** Integer cents. */
    price: integer().notNull(),
    colour: text().notNull(),
    description: text().notNull(),
    details: jsonb().$type<ProductDetail[]>().notNull().default([]),
    /** In display order; the first is the primary shot used on product cards. */
    images: jsonb().$type<ProductImage[]>().notNull(),
    /** Units available to sell. Status (in stock / low / sold out) is derived in lib/catalog/stock.ts. */
    stock: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("products_category_id_idx").on(table.categoryId),
    index("products_created_at_idx").on(table.createdAt),
    check("products_price_nonnegative", sql`${table.price} >= 0`),
    check("products_stock_nonnegative", sql`${table.stock} >= 0`),
  ],
);
