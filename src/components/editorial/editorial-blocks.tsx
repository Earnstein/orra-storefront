import { collectProductSlugs } from "@/content/blocks";
import type { Block } from "@/content/types";
import { getProductsBySlugs } from "@/lib/catalog/queries";
import { CategoryTilesBlock } from "./category-tiles-block";
import { HeroBlock } from "./hero-block";
import { ImageBlock } from "./image-block";
import { ProductRowBlock } from "./product-row-block";
import { QuoteBlock } from "./quote-block";
import { StoryBlock } from "./story-block";
import { TextBlock } from "./text-block";

/**
 * Renders an editorial page's blocks, fetching every product they show in one query. A hero
 * as the first block is the page's h1; otherwise the page must render its own.
 */
export async function EditorialBlocks({ blocks }: { blocks: Block[] }) {
  const products = new Map((await getProductsBySlugs(collectProductSlugs(blocks))).map((p) => [p.slug, p]));

  return blocks.map((block, index) => {
    const key = `${block.type}-${index}`;
    switch (block.type) {
      case "hero":
        return <HeroBlock key={key} {...block} headingLevel={index === 0 ? "h1" : "h2"} />;
      case "categoryTiles":
        return <CategoryTilesBlock key={key} {...block} products={products} />;
      case "productRow":
        return (
          <ProductRowBlock
            key={key}
            heading={block.heading}
            action={block.action}
            products={block.productSlugs.flatMap((slug) => products.get(slug) ?? [])}
          />
        );
      case "story":
        return <StoryBlock key={key} {...block} />;
      case "text":
        return <TextBlock key={key} {...block} />;
      case "image":
        return <ImageBlock key={key} {...block} />;
      case "quote":
        return <QuoteBlock key={key} {...block} />;
      default:
        return block satisfies never;
    }
  });
}
