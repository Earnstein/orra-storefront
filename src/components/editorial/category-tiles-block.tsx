import Image from "next/image";
import Link from "next/link";

import { Container, Media, Section } from "@/components/primitives";
import type { Block } from "@/content/types";
import type { Product } from "@/lib/catalog/types";
import { TileStrip } from "./tile-strip";

type CategoryTilesBlockProps = Extract<Block, { type: "categoryTiles" }> & { products: Map<string, Product> };

/**
 * Category links pictured by one of their products; a missing product leaves the label on a
 * blank tile. A swipeable strip on phones, then one row with a column per tile from md up. The
 * strip scrolls, which clips overflow on both axes, so py-1 leaves room for the focus ring.
 */
export function CategoryTilesBlock({ heading, tiles, products }: CategoryTilesBlockProps) {
  if (tiles.length === 0) return null;
  return (
    <Section>
      <Container className="pb-block">
        <h2 className="text-headline">{heading}</h2>
      </Container>
      <TileStrip
        className="flex snap-x snap-mandatory scroll-px-tile gap-tile overflow-x-auto overscroll-x-contain px-tile py-1 [scrollbar-width:none] md:grid md:py-0 md:grid-cols-(--tile-columns) md:overflow-visible"
        style={{ "--tile-columns": `repeat(${tiles.length}, minmax(0, 1fr))` } as React.CSSProperties}
      >
        {tiles.map((tile, index) => {
          const image = products.get(tile.productSlug)?.images[0];
          return (
            <Link
              key={`${tile.href}-${index}`}
              href={tile.href}
              className="group flex w-[42vw] shrink-0 snap-start flex-col gap-3 md:w-auto"
            >
              <Media ratio="portrait">
                {image && (
                  <Image
                    src={image.src}
                    alt=""
                    fill
                    sizes={`(min-width: 768px) ${Math.ceil(100 / tiles.length)}vw, 42vw`}
                    className="object-cover"
                  />
                )}
              </Media>
              <span className="eyebrow link-quiet px-1 pb-2 group-hover:decoration-current">{tile.label}</span>
            </Link>
          );
        })}
      </TileStrip>
    </Section>
  );
}
