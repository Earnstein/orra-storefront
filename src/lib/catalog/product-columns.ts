import { sql } from "drizzle-orm";

import { categories, products } from "@/db/schema";
import type { CatalogImage } from "./types";

/** The columns that make up the storefront's Product shape (types.ts), for catalogue selects. */
export const productColumns = {
  slug: products.slug,
  name: products.name,
  price: products.price,
  colour: products.colour,
  description: products.description,
  details: products.details,
  stock: products.stock,
  images: products.images,
  category: { slug: categories.slug, name: categories.name },
};

/** The ProductSummary shape (types.ts): a card's fields, with only the first image. */
export const productSummaryColumns = {
  slug: products.slug,
  name: products.name,
  price: products.price,
  stock: products.stock,
  images: sql<CatalogImage[]>`jsonb_build_array(${products.images} -> 0)`,
};
