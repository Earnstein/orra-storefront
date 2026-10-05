"use client";

import { useQueryStates } from "nuqs";
import { useMemo, useState } from "react";

import { Container, Grid } from "@/components/primitives";
import { ProductCard } from "@/components/product/product-card";
import { Button } from "@/components/ui/button";
import { activeFilterCount, SORT_LABELS, type ResultsScope } from "@/lib/catalog/filters";
import type { Results } from "@/lib/catalog/results";
import { resultsApiPath, resultsParsers, toResultsQuery } from "@/lib/catalog/search-params";
import { cn } from "@/lib/utils";
import { ListingToolbar } from "./listing-toolbar";
import { LoadMore } from "./load-more";
import { useResults } from "./use-results";

// Tiles in the first row at the widest layout (xl: 4 columns) load their images eagerly.
const FIRST_ROW = 4;

/** Every URL key that holds a filter, cleared together by Clear all. */
const CLEARED_FILTERS = { category: null, audience: null, colour: null, material: null, price: null, stock: null, new: null, page: null };

/**
 * A listing's results, driven by the URL: toolbar, grid and Load more. The first results come
 * hydrated from the server; later ones from /api/products. While new results load, the current
 * ones stay on screen, dimmed (but not for Load more, which shows on its button instead).
 */
export function ResultsView({ scope, tab, empty }: { scope: ResultsScope; tab?: string; empty: React.ReactNode }) {
  const [params, setParams] = useQueryStates(resultsParsers);
  const query = useMemo(() => toResultsQuery(params, scope, tab), [params, scope, tab]);
  const { data, isPlaceholderData, isError, isFetching, refetch } = useResults(query);

  // The last results shown stay on screen if a later request fails.
  const [lastData, setLastData] = useState<Results | undefined>(data);
  if (data && data !== lastData) setLastData(data);
  const results = data ?? lastData;

  // The Load more in flight: the URL it asked for and how many products were shown before.
  const [more, setMore] = useState<{ path: string; from: number } | null>(null);
  const path = resultsApiPath(query);
  const loadingMore = isPlaceholderData && more?.path === path;
  const announcement =
    more?.path === path && !isPlaceholderData && results ? `${results.products.length - more.from} more items loaded` : "";

  if (!results) return null;

  const filtersActive = activeFilterCount(query.filters) > 0;
  const updating = (isPlaceholderData && !loadingMore) || (isError && !data);

  return (
    <>
      <ListingToolbar total={results.total} sortLabel={SORT_LABELS[query.sort]} activeCount={activeFilterCount(query.filters)} />

      {isError && !isFetching && (
        <Container className="flex items-center gap-4 pb-4 caption" role="alert">
          <p>Couldn’t update results.</p>
          <Button variant="link" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </Container>
      )}

      {results.total === 0 ? (
        <Container className="flex flex-col items-start gap-6 pt-block pb-section">
          {empty}
          {filtersActive && (
            <Button variant="outline" onClick={() => setParams(CLEARED_FILTERS, { history: "push" })}>
              Clear all filters
            </Button>
          )}
        </Container>
      ) : (
        <>
          <Grid
            layout="products"
            aria-busy={updating}
            className={cn("px-tile pb-block transition-opacity duration-200", updating && "opacity-60")}
          >
            {results.products.map((product, index) => (
              <ProductCard key={product.slug} product={product} eager={index < FIRST_ROW} />
            ))}
          </Grid>
          <LoadMore
            shown={results.products.length}
            total={results.total}
            loading={loadingMore}
            announcement={announcement}
            onLoadMore={() => {
              const next = { ...query, page: results.page + 1 };
              setMore({ path: resultsApiPath(next), from: results.products.length });
              void setParams({ page: next.page }, { history: "replace", scroll: false });
            }}
          />
        </>
      )}
    </>
  );
}
