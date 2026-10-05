import { Container, Grid, Media } from "@/components/primitives";

/** Stands in for the toolbar and the first rows while a listing's results stream in. */
export function ResultsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading products">
      <Container className="flex items-center justify-between gap-4 py-4">
        <div className="h-4 w-40 bg-surface motion-safe:animate-pulse" />
        <div className="h-4 w-24 bg-surface motion-safe:animate-pulse" />
      </Container>
      <Grid layout="products" className="px-tile pb-section">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex flex-col gap-3">
            <Media className="motion-safe:animate-pulse" />
            <div className="flex flex-col gap-1.5 px-1 pb-2">
              <div className="h-3 w-3/4 bg-surface" />
              <div className="h-3 w-1/4 bg-surface" />
            </div>
          </div>
        ))}
      </Grid>
    </div>
  );
}
