import { keepPreviousData, useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";

import type { ResultsQuery } from "@/lib/catalog/filters";
import type { Results, ResultsPage } from "@/lib/catalog/results";
import { resultsApiPath } from "@/lib/catalog/search-params";

// One infinite query per set of filters, sort and scope (the page isn't part of the key). Its
// first entry restores everything up to the URL's page in one request (capped at
// MAX_RESTORE_PAGES); each Load more appends one page fetched on its own (?slice=1), so earlier
// products are never sent again. Every request is its own endpoint URL, so the browser and the
// CDN cache them too.

export type ResultsPageParam = { page: number; slice: boolean };
export type ResultsData = InfiniteData<Results | ResultsPage, ResultsPageParam>;

export const resultsQueryKey = (query: ResultsQuery) => ["results", resultsApiPath({ ...query, page: 1 })] as const;

/** The query cache's data for results read on the server, so the client starts with them. */
export function initialResultsData(results: Results): ResultsData {
  return { pages: [results], pageParams: [{ page: results.page, slice: false }] };
}

async function fetchResults(url: string, signal: AbortSignal): Promise<Results | ResultsPage> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Results request failed: ${response.status}`);
  return response.json();
}

/**
 * Results for a query. While a new filter set loads, the previous results stay as placeholder
 * data (`isPlaceholderData`), or `fallback` before there are any; a superseded request is aborted.
 */
export function useResults(query: ResultsQuery, fallback?: Results) {
  return useInfiniteQuery<Results | ResultsPage, Error, ResultsData, ReturnType<typeof resultsQueryKey>, ResultsPageParam>({
    queryKey: resultsQueryKey(query),
    queryFn: ({ pageParam, signal }) =>
      fetchResults(resultsApiPath({ ...query, page: pageParam.page }, { slice: pageParam.slice }), signal),
    initialPageParam: { page: query.page, slice: false },
    getNextPageParam: (last) => (last.page < last.pageCount ? { page: last.page + 1, slice: true } : undefined),
    placeholderData: fallback ? (previous) => previous ?? initialResultsData(fallback) : keepPreviousData,
  });
}

/** The restored entry: the total, page count and filter counts for the whole result set. */
export const summaryOf = (data: ResultsData) => data.pages[0] as Results;
