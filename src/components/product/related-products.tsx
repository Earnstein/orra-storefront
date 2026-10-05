import { Container, Grid, Section } from "@/components/primitives";
import type { Product } from "@/lib/catalog/types";
import { completeRows } from "./complete-rows";
import { ProductCard } from "./product-card";

/** "You may also like": hides cards that would sit alone in a last row (see completeRows). */
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
        {products.map((product, index) => (
          <div key={product.slug} className={completeRows(index, products.length)}>
            <ProductCard product={product} />
          </div>
        ))}
      </Grid>
    </Section>
  );
}
