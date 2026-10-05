import Image from "next/image";
import Link from "next/link";

import { Media } from "@/components/primitives";
import { formatPrice } from "@/lib/format";
import type { ProductSummary } from "@/lib/catalog/types";
import { stockStatus } from "@/lib/catalog/stock";

/** `sizes` for tiles in a Grid layout="products" (2 → 3 at md → 4 at xl columns). */
export const PRODUCT_GRID_SIZES = "(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw";

/**
 * Product tile: image first, then name and price. The whole tile is one link.
 * Set `eager` on tiles in the first row of a page so their images don't wait for lazy loading.
 */
export function ProductCard({
  product,
  sizes = PRODUCT_GRID_SIZES,
  eager = false,
}: {
  product: ProductSummary;
  sizes?: string;
  eager?: boolean;
}) {
  const [image] = product.images;
  const soldOut = stockStatus(product.stock).state === "out_of_stock";

  return (
    <Link href={`/products/${product.slug}`} className="group flex flex-col gap-3">
      <Media>
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes={sizes}
          loading={eager ? "eager" : undefined}
          className="object-cover"
        />
      </Media>
      <div className="flex flex-col gap-0.5 px-1 pb-2 caption">
        <h3 className="link-quiet group-hover:decoration-current">{product.name}</h3>
        <p className="text-muted-foreground">{soldOut ? "Sold out" : formatPrice(product.price)}</p>
      </div>
    </Link>
  );
}
