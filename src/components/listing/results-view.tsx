"use client";

import { useQueryStates } from "nuqs";
import { useMemo, useRef, useState } from "react";

import { Container, Grid } from "@/components/primitives";
import { ProductCard } from "@/components/product/product-card";
import { Button } from "@/components/ui/button";
import {
  activeFilterCount,
  normaliseQuery,
  SORT_LABELS,
  withoutFilter,
  type ActiveFilter,
  type ResultsQuery,
  type ResultsScope,
} from "@/lib/catalog/filters";
import type { Results } from "@/lib/catalog/results";
import { resultsApiPath, resultsParamsFor, resultsParsers, toResultsQuery } from "@/lib/catalog/search-params";
import { cn } from "@/lib/utils";
import { FilterChips } from "./filter-chips";
import { FilterSheet } from "./filter-sheet";
import { ListingToolbar, type SheetSection } from "./listing-toolbar";
import { LoadMore } from "./load-more";
import { useResults } from "./use-results";

// Tiles in the first row at the widest layout (xl: 4 columns) load their images eagerly.
const FIRST_ROW = 4;

/** Every URL key that holds a filter, cleared together by Clear all. */
const CLEARED_FILTERS = { category: null, audience: null, colour: null, material: null, price: null, stock: null, new: null, page: null };

/**
 * A listing's results, driven by the URL: toolbar, chips, filter sheet, grid and Load more.
 * Applying the sheet and removing a chip push a history entry (Back undoes them); Load more
 * replaces the current one. The first results come
 * hydrated from the server; later ones from /api/products. While new results load, the current
 * ones stay on screen, dimmed (but not for Load more, which shows on its button instead).
 */
export function ResultsView({ scope, tab, empty }: { scope: ResultsScope; tab?: string; empty: React.ReactNode }) {
  const [params, setParams] = useQueryStates(resultsParsers);
  const query = useMemo(() => toResultsQuery(params, scope, tab), [params, scope, tab]);
  const { data, isPlaceholderData, isError, isFetching, refetch } = useResults(query);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSection, setSheetSection] = useState<SheetSection>("filters");
  const filterButton = useRef<HTMLButtonElement>(null);

  // The last results shown stay on screen if a later request fails.
  const [lastData, setLastData] = useState<Results | undefined>(data);
  if (data && data !== lastData) setLastData(data);
  const results = data ?? lastData;

  // The Load more in flight (the URL it asked for and how many products were shown before), and
  // the announcement once it lands. Both belong to one URL: leaving it (a filter change, Back)
  // drops them, so coming back later doesn't announce again.
  const [more, setMore] = useState<{ path: string; from: number } | null>(null);
  const [announced, setAnnounced] = useState<{ path: string; text: string } | null>(null);
  const path = resultsApiPath(query);
  if (more && more.path !== path) setMore(null);
  if (announced && announced.path !== path) setAnnounced(null);
  if (more?.path === path && data && !isPlaceholderData) {
    setAnnounced({ path, text: `${data.products.length - more.from} more items loaded` });
    setMore(null);
  }
  const loadingMore = isPlaceholderData && more?.path === path;

  if (!results) return null;

  const filtersActive = activeFilterCount(query.filters) > 0;
  const updating = isPlaceholderData && !loadingMore;

  // Filter changes start from page 1 and add a history entry. Chip removals read the latest URL
  // state, so quick successive removals all apply.
  const push = { history: "push", scroll: false } as const;
  const apply = (draft: ResultsQuery) => {
    const next = normaliseQuery({ ...draft, page: 1 });
    // Showing the same results again only resets the page; it isn't a new history entry.
    if (resultsApiPath(next) === resultsApiPath({ ...query, page: 1 })) {
      if (query.page !== 1) void setParams({ page: null }, { history: "replace", scroll: false });
      return;
    }
    void setParams(resultsParamsFor(next), push);
  };
  const remove = (filter: ActiveFilter) =>
    setParams((latest) => {
      const current = toResultsQuery(latest, scope, tab);
      return resultsParamsFor({ ...current, filters: withoutFilter(current.filters, filter), page: 1 });
    }, push);
  // Clearing removes the control that was used, so focus moves to Filter and sort.
  const clear = () => {
    void setParams(CLEARED_FILTERS, push);
    filterButton.current?.focus();
  };

  return (
    <>
      {/* An empty listing without filters has nothing to sort or filter. */}
      {(results.total > 0 || filtersActive || updating) && (
        <ListingToolbar
          total={results.total}
          sortLabel={SORT_LABELS[query.sort]}
          activeCount={activeFilterCount(query.filters)}
          filterButtonRef={filterButton}
          onOpen={(section) => {
            setSheetSection(section);
            setSheetOpen(true);
          }}
        />
      )}
      <FilterChips
        filters={query.filters}
        facets={results.facets}
        onRemove={remove}
        onClear={clear}
        onEmptied={() => filterButton.current?.focus()}
      />
      <FilterSheet
        open={sheetOpen}
        section={sheetSection}
        query={query}
        results={results}
        onClose={() => setSheetOpen(false)}
        onApply={(draft) => {
          setSheetOpen(false);
          apply(draft);
        }}
      />

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
            <Button variant="outline" onClick={clear}>
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
            disabled={updating}
            announcement={announced?.path === path ? announced.text : ""}
            onLoadMore={() => {
              // A failed Load more already asked for the next page: try it again.
              if (isError) return void refetch();
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
