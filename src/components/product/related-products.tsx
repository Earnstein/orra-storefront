import { Container, Grid, Section } from "@/components/primitives";
import type { Product } from "@/lib/catalog/sample-data";
import { ProductCard } from "./product-card";

const tileSizes = "(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw";

export function RelatedProducts({ products }: { products: Product[] }) {
  if (products.length === 0) return null;
  return (
    <Section aria-labelledby="related-heading" className="border-t">
      <Container className="pb-block">
        <h2 id="related-heading" className="text-headline">
          You may also like
        </h2>
      </Container>
      <Grid layout="products" className="px-tile">
        {products.map((product) => (
          <ProductCard key={product.slug} product={product} sizes={tileSizes} />
        ))}
      </Grid>
    </Section>
  );
}
