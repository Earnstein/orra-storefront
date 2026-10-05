import { Container, Grid, Section, TextLink } from "@/components/primitives";
import { ProductCard } from "@/components/product/product-card";
import type { Block } from "@/content/types";
import type { Product } from "@/lib/catalog/types";

type ProductRowBlockProps = Pick<Extract<Block, { type: "productRow" }>, "heading" | "action"> & { products: Product[] };

/**
 * A heading and one row of product cards (two rows of two on phones); renders nothing if none
 * of the products exist. The fourth card is hidden while the grid has three columns, so the
 * row never leaves a card on its own.
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
        {products.slice(0, 4).map((product, index) => (
          <div key={product.slug} className={index === 3 ? "md:max-xl:hidden" : undefined}>
            <ProductCard product={product} />
          </div>
        ))}
      </Grid>
    </Section>
  );
}
