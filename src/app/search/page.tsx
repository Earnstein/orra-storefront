import { HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import { Suspense } from "react";

import { prefetchResults } from "@/components/listing/results-section";
import { ResultsSkeleton } from "@/components/listing/results-skeleton";
import { Container } from "@/components/primitives";
import { SearchView } from "@/components/search/search-view";
import { Skeleton } from "@/components/ui/skeleton";
import { loadResultsParams, toResultsQuery } from "@/lib/catalog/search-params";

// Search results depend on the URL, so the page streams under <Suspense>; there's no static shell
// beyond the layout. Results pages aren't indexed (endless query combinations).

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const { q } = await loadResultsParams(searchParams);
  return q.trim() ? { title: "Search", robots: { index: false } } : { title: "Search" };
}

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <SearchSection searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Reads the query and its first results on the server and hands them to the client view through
 * the query cache. Keyed by the query, so navigating to another search starts a fresh field.
 */
async function SearchSection({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const params = await loadResultsParams(searchParams);
  const q = params.q.trim();
  const state = q ? await prefetchResults(toResultsQuery(params, { kind: "search", q })) : undefined;

  return (
    <HydrationBoundary state={state}>
      <SearchView key={q} />
    </HydrationBoundary>
  );
}

function SearchSkeleton() {
  return (
    <>
      <Container className="py-block">
        <Skeleton className="h-12 w-full bg-surface" />
      </Container>
      <ResultsSkeleton />
    </>
  );
}
