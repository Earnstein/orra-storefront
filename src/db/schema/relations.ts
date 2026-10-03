import { relations } from "drizzle-orm";

import { categories, products } from "./catalog";

// Relations for the relational query API (db.query.*). They don't create foreign keys;
// those are declared on the columns in catalog.ts.

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
}));
