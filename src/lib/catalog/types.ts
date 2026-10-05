import type { ProductDetail, ProductImage } from "@/db/schema/catalog";

// Shapes the storefront renders. queries.ts maps database rows to these, so components
// don't depend on the table layout.

export type CatalogImage = ProductImage;

export type Category = { slug: string; name: string };

export type Product = {
  slug: string;
  name: string;
  category: Category;
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

/**
 * What a product card shows: listing and search results carry only this, so their payloads (and
 * each listing page's embedded data) stay small. `images` holds just the card image.
 */
export type ProductSummary = Pick<Product, "slug" | "name" | "price" | "stock" | "images">;
