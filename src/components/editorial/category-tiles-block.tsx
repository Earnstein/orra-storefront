import Image from "next/image";
import Link from "next/link";

import { Container, Grid, Media, Section } from "@/components/primitives";
import type { Block } from "@/content/types";
import type { Product } from "@/lib/catalog/types";
import { PRODUCT_GRID_SIZES } from "@/components/product/product-card";

type CategoryTilesBlockProps = Extract<Block, { type: "categoryTiles" }> & { products: Map<string, Product> };

/** Category links pictured by one of their products; a missing product leaves the label on a blank tile. */
export function CategoryTilesBlock({ heading, tiles, products }: CategoryTilesBlockProps) {
  return (
    <Section>
      <Container className="pb-block">
        <h2 className="text-headline">{heading}</h2>
      </Container>
      <Grid layout="products" className="px-tile">
        {tiles.map((tile, index) => {
          const image = products.get(tile.productSlug)?.images[0];
          return (
            <Link key={`${tile.href}-${index}`} href={tile.href} className="group flex flex-col gap-3">
              <Media ratio="portrait">
                {image && (
                  <Image
                    src={image.src}
                    alt=""
                    fill
                    sizes={PRODUCT_GRID_SIZES}
                    className="object-cover"
                  />
                )}
              </Media>
              <span className="eyebrow link-quiet px-1 pb-2 group-hover:decoration-current">{tile.label}</span>
            </Link>
          );
        })}
      </Grid>
    </Section>
  );
}
