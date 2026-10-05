import { Container, Grid, Section, TextLink } from "@/components/primitives";
import { ProductCard } from "@/components/product/product-card";
import type { Block } from "@/content/types";
import type { Product } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

type ProductRowBlockProps = Pick<Extract<Block, { type: "productRow" }>, "heading" | "action"> & { products: Product[] };

/**
 * A heading and a grid of product cards; renders nothing if none of the products exist. Cards
 * that would start an incomplete last row are hidden at that column count (2, then 3 from md,
 * then 4 from xl), so the grid never leaves a card on its own.
 */
export function ProductRowBlock({ heading, action, products }: ProductRowBlockProps) {
  if (products.length === 0) return null;
  return (
    <Section>
      <Container className="flex items-end justify-between gap-6 pb-block">
        <h2 className="text-headline">{heading}</h2>
        {action && (
          <TextLink href={action.href} label className="shrink-0">
            {action.label}
          </TextLink>
        )}
      </Container>
      <Grid layout="products" className="px-tile">
        {products.map((product, index) => (
          <div key={`${product.slug}-${index}`} className={completeRows(index, products.length)}>
            <ProductCard product={product} />
          </div>
        ))}
      </Grid>
    </Section>
  );
}

/** Hides a card when it falls in an incomplete last row for the grid's current column count. */
function completeRows(index: number, count: number) {
  const fits = (columns: number) => index < Math.max(columns, count - (count % columns));
  return cn(!fits(2) && "max-md:hidden", !fits(3) && "md:max-xl:hidden", !fits(4) && "xl:hidden");
}
