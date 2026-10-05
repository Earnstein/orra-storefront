import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { ResultsQuery } from "@/lib/catalog/filters";
import type { Results } from "@/lib/catalog/results";
import { resultsApiPath } from "@/lib/catalog/search-params";

// One query per results URL: the key is the endpoint path, so the server's prefetch, the browser's
// cache and the CDN all agree on what "the same results" means. Page N's results hold the first
// N × 24 products, so Load more is just the next page's query.

export const resultsQueryKey = (query: ResultsQuery) => ["results", resultsApiPath(query)] as const;

async function fetchResults(query: ResultsQuery, signal: AbortSignal): Promise<Results> {
  const response = await fetch(resultsApiPath(query), { signal });
  if (!response.ok) throw new Error(`Results request failed: ${response.status}`);
  return response.json();
}

/**
 * Results for a query. While a new query loads, the previous results stay as placeholder data
 * (`isPlaceholderData`); a superseded request is aborted.
 */
export function useResults(query: ResultsQuery) {
  return useQuery({
    queryKey: resultsQueryKey(query),
    queryFn: ({ signal }) => fetchResults(query, signal),
    placeholderData: keepPreviousData,
  });
}
