import { categories, products } from "@/db/schema";

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
