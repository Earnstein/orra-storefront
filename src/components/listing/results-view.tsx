"use client";

import { useQueryStates } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";

import { Container, Grid } from "@/components/primitives";
import { ProductCard } from "@/components/product/product-card";
import { Button } from "@/components/ui/button";
import {
  activeFilterCount,
  normaliseQuery,
  RESULTS_PAGE_SIZE,
  SORT_LABELS,
  withoutFilter,
  type ActiveFilter,
  type ResultsQuery,
  type ResultsScope,
} from "@/lib/catalog/filters";
import { resultsApiPath, resultsParamsFor, resultsParsers, toResultsQuery } from "@/lib/catalog/search-params";
import { cn } from "@/lib/utils";
import { FilterChips } from "./filter-chips";
import { FilterSheet } from "./filter-sheet";
import { ListingToolbar, type SheetSection } from "./listing-toolbar";
import { LoadMore } from "./load-more";
import { summaryOf, useResults, type ResultsData } from "./use-results";

// Tiles in the first row at the widest layout (xl: 4 columns) load their images eagerly.
const FIRST_ROW = 4;

/** Every URL key that holds a filter, cleared together by Clear all. */
const CLEARED_FILTERS = { category: null, audience: null, colour: null, material: null, price: null, stock: null, new: null, page: null };

/**
 * A listing's results, driven by the URL: toolbar, chips, filter sheet, grid and Load more.
 * Applying the sheet and removing a chip push a history entry (Back undoes them); Load more
 * replaces the current one. The first results come hydrated from the server; later ones from
 * /api/products. The grid shows the URL's `page` × 24 of the products loaded so far. While a new
 * filter set loads, the current results stay on screen, dimmed.
 */
export function ResultsView({ scope, tab, empty }: { scope: ResultsScope; tab?: string; empty: React.ReactNode }) {
  const [params, setParams] = useQueryStates(resultsParsers);
  const query = useMemo(() => toResultsQuery(params, scope, tab), [params, scope, tab]);
  const { data, isPlaceholderData, isError, isFetching, isFetchingNextPage, isFetchNextPageError, fetchNextPage, refetch } =
    useResults(query);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSection, setSheetSection] = useState<SheetSection>("filters");
  const filterButton = useRef<HTMLButtonElement>(null);

  // The last results shown stay on screen if a later request fails.
  const [lastData, setLastData] = useState<ResultsData | undefined>(data);
  if (data && data !== lastData) setLastData(data);
  const shownData = data ?? lastData;

  // The Load more announcement belongs to the URL it led to: leaving that URL (a filter change,
  // Back) drops it, so coming back later doesn't announce again.
  const [announced, setAnnounced] = useState<{ path: string; text: string } | null>(null);
  const path = resultsApiPath(query);
  if (announced && announced.path !== path) setAnnounced(null);

  const loaded = useMemo(() => shownData?.pages.flatMap((page) => page.products) ?? [], [shownData]);
  const loadedPage = shownData?.pages.at(-1)?.page ?? 1;
  const shownPage = Math.min(query.page, loadedPage);
  const settled = !isPlaceholderData && !isFetching;

  // A URL asking for more pages than were restored (a hand-edited ?page, or one past the restore
  // cap) is brought in line with what's shown.
  useEffect(() => {
    if (settled && query.page > loadedPage) {
      void setParams({ page: loadedPage === 1 ? null : loadedPage }, { history: "replace", scroll: false });
    }
  }, [settled, query.page, loadedPage, setParams]);

  if (!shownData) return null;

  const results = summaryOf(shownData);
  const products = loaded.slice(0, shownPage * RESULTS_PAGE_SIZE);
  const filtersActive = activeFilterCount(query.filters) > 0;
  const updating = isPlaceholderData;

  // Load more shows the next page: from the cache if it's already loaded, else fetched on its
  // own. The URL moves on only once the products are there, and only if the filters haven't
  // changed meanwhile.
  const loadMore = async () => {
    const nextPage = shownPage + 1;
    let available = loaded;
    if (loadedPage < nextPage) {
      const result = await fetchNextPage();
      if (result.isError || !result.data) return;
      available = result.data.pages.flatMap((page) => page.products);
    }
    const added = Math.min(available.length, nextPage * RESULTS_PAGE_SIZE) - products.length;
    const base = resultsApiPath({ ...query, page: 1 });
    setAnnounced({ path: resultsApiPath({ ...query, page: nextPage }), text: `${added} more items loaded` });
    void setParams(
      (latest) => (resultsApiPath({ ...toResultsQuery(latest, scope, tab), page: 1 }) === base ? { page: nextPage } : {}),
      { history: "replace", scroll: false },
    );
  };

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
          <p>{isFetchNextPageError ? "Couldn’t load more items." : "Couldn’t update results."}</p>
          <Button variant="link" size="sm" onClick={() => (isFetchNextPageError ? loadMore() : refetch())}>
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
            {products.map((product, index) => (
              <ProductCard key={product.slug} product={product} eager={index < FIRST_ROW} />
            ))}
          </Grid>
          <LoadMore
            shown={products.length}
            total={results.total}
            loading={isFetchingNextPage}
            disabled={updating}
            announcement={announced?.path === path ? announced.text : ""}
            onLoadMore={() => void loadMore()}
          />
        </>
      )}
    </>
  );
}
