import "server-only";

import { products } from "@/db/seed/catalog";
import type { CatalogImage } from "@/lib/catalog/types";

/** The seed catalogue's photos, offered in the editor when uploads aren't configured. */
export function libraryPhotos(): CatalogImage[] {
  const seen = new Set<string>();
  return products.flatMap((product) => product.images).filter((image) => !seen.has(image.src) && seen.add(image.src));
}
