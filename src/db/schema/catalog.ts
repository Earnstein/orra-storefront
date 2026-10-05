import { sql } from "drizzle-orm";
import { check, customType, index, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Catalogue: categories and products. Stock is a column on products (no variants or
// warehouses yet, so a product has exactly one stock figure).

/** Who a product is for. The Women and Men collections list their audience plus unisex. */
export const audience = pgEnum("audience", ["women", "men", "unisex"]);
export type Audience = (typeof audience.enumValues)[number];

/** Broad colour group for filtering; `colour` keeps the exact shade shown to shoppers. */
export const colourFamily = pgEnum("colour_family", [
  "black",
  "white",
  "grey",
  "beige",
  "brown",
  "red",
  "pink",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "gold",
  "silver",
  "multicolour",
]);
export type ColourFamily = (typeof colourFamily.enumValues)[number];

/** Main material for filtering; the product details carry the full composition. */
export const material = pgEnum("material", [
  "leather",
  "suede",
  "canvas",
  "nylon",
  "cotton",
  "linen",
  "wool",
  "cashmere",
  "silk",
  "satin",
  "gold",
  "silver",
  "metal",
  "acetate",
  "mixed",
]);
export type Material = (typeof material.enumValues)[number];

export const categories = pgTable("categories", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Postgres full-text search vector (read as its text form; the trigger writes it). */
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

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
    audience: audience().notNull(),
    /** Integer cents. */
    price: integer().notNull(),
    colour: text().notNull(),
    colourFamily: colourFamily().notNull(),
    material: material().notNull(),
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
    /**
     * Full-text search: name (weight A); colour, colour family, material and category name (B);
     * description and detail values (C). Kept current by triggers (migration 0004), which read
     * the category's name — a generated column can't. The empty default is always overwritten.
     */
    search: tsvector().notNull().default(sql`''::tsvector`),
    /** Lower-cased name, colour, colour family, material and category name, for typo matching (pg_trgm). */
    searchText: text().notNull().default(""),
  },
  (table) => [
    index("products_category_id_idx").on(table.categoryId),
    index("products_created_at_idx").on(table.createdAt),
    index("products_search_idx").using("gin", table.search),
    index("products_search_text_trgm_idx").using("gin", sql`${table.searchText} gin_trgm_ops`),
    check("products_price_nonnegative", sql`${table.price} >= 0`),
    check("products_stock_nonnegative", sql`${table.stock} >= 0`),
  ],
);
