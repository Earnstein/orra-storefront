import { dehydrate, HydrationBoundary, QueryClient, type DehydratedState } from "@tanstack/react-query";

import type { ResultsQuery, ResultsScope } from "@/lib/catalog/filters";
import { getResults } from "@/lib/catalog/results";
import { loadResultsParams, toResultsQuery } from "@/lib/catalog/search-params";
import { ResultsView } from "./results-view";
import { initialResultsData, resultsQueryKey } from "./use-results";

/**
 * A listing's results for the request's URL: read once on the server (a cached read, restoring at
 * most MAX_RESTORE_PAGES pages) and handed to the client view through the query cache, so it
 * starts with them and doesn't fetch again.
 * Reads `searchParams`, so render it under <Suspense>.
 */
export async function ResultsSection({
  scope,
  tab,
  searchParams,
  empty,
}: {
  scope: ResultsScope;
  tab?: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  empty: React.ReactNode;
}) {
  const query = toResultsQuery(await loadResultsParams(searchParams), scope, tab);

  return (
    <HydrationBoundary state={await prefetchResults(query)}>
      <ResultsView scope={scope} tab={tab} empty={empty} />
    </HydrationBoundary>
  );
}

/** A query's results, read on the server and packed for a <HydrationBoundary>. */
export async function prefetchResults(query: ResultsQuery): Promise<DehydratedState> {
  const queryClient = new QueryClient();
  queryClient.setQueryData(resultsQueryKey(query), initialResultsData(await getResults(query)));
  return dehydrate(queryClient);
}
