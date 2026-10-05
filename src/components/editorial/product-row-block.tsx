import { Container, Grid, Section, TextLink } from "@/components/primitives";
import { ProductCard } from "@/components/product/product-card";
import type { Block } from "@/content/types";
import type { Product } from "@/lib/catalog/types";

type ProductRowBlockProps = Pick<Extract<Block, { type: "productRow" }>, "heading" | "action"> & { products: Product[] };

/** A heading and a grid of product cards; renders nothing if none of the products exist. */
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
        {products.map((product) => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </Grid>
    </Section>
  );
}
