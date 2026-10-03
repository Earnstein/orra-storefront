import type { ProductDetail, ProductImage } from "@/db/schema/catalog";

// Shapes the storefront renders. queries.ts maps database rows to these, so components
// don't depend on the table layout.

export type CatalogImage = ProductImage;

export type Product = {
  slug: string;
  name: string;
  category: { slug: string; name: string };
  /** Integer cents. */
  price: number;
  colour: string;
  description: string;
  details: ProductDetail[];
  /** Units available to sell. Status (in stock / low / sold out) is derived in stock.ts. */
  stock: number;
  /** First image is the primary shot used on product cards. */
  images: CatalogImage[];
};
