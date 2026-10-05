import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";

import type { ResultsScope } from "@/lib/catalog/filters";
import { getResults } from "@/lib/catalog/results";
import { loadResultsParams, toResultsQuery } from "@/lib/catalog/search-params";
import { ResultsView } from "./results-view";
import { resultsQueryKey } from "./use-results";

/**
 * A listing's results for the request's URL: read once on the server (a cached read) and handed to
 * the client view through the query cache, so it starts with them and doesn't fetch again.
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
  const queryClient = new QueryClient();
  queryClient.setQueryData(resultsQueryKey(query), await getResults(query));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ResultsView scope={scope} tab={tab} empty={empty} />
    </HydrationBoundary>
  );
}
