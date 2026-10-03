import Image from "next/image";
import Link from "next/link";

import { Media } from "@/components/primitives";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/catalog/sample-data";
import { stockStatus } from "@/lib/catalog/stock";

/** Product tile: image first, then name and price. The whole tile is one link. */
export function ProductCard({ product, sizes }: { product: Product; sizes: string }) {
  const [image] = product.images;
  const soldOut = stockStatus(product.stock).state === "out_of_stock";

  return (
    <Link href={`/products/${product.slug}`} className="group flex flex-col gap-3">
      <Media>
        <Image src={image.src} alt={image.alt} fill sizes={sizes} className="object-cover" />
      </Media>
      <div className="flex flex-col gap-0.5 px-1 pb-2 caption">
        <h3 className="link-quiet group-hover:decoration-current">{product.name}</h3>
        <p className="text-muted-foreground">{soldOut ? "Sold out" : formatPrice(product.price)}</p>
      </div>
    </Link>
  );
}
