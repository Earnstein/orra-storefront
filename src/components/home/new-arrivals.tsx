import { Container, Grid, Section, TextLink } from "@/components/primitives";
import { ProductCard } from "@/components/product/product-card";
import { getNewArrivals } from "@/lib/catalog/queries";

export async function NewArrivals() {
  const products = await getNewArrivals();
  return (
    <Section aria-labelledby="new-arrivals-heading">
      <Container className="flex items-end justify-between gap-4 pb-block">
        <h2 id="new-arrivals-heading" className="text-headline">
          New this season
        </h2>
        <TextLink href="/collections/new" label className="shrink-0">
          View all
        </TextLink>
      </Container>

      <Grid layout="products" className="px-tile">
        {products.map((product) => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </Grid>
    </Section>
  );
}
