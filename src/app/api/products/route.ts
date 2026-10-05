import { resolveCollection } from "@/lib/catalog/collections";
import type { ResultsScope } from "@/lib/catalog/filters";
import { getCategories } from "@/lib/catalog/queries";
import { getResults } from "@/lib/catalog/results";
import { loadResultsParams, toResultsQuery } from "@/lib/catalog/search-params";

// Results for the listing UI's client-side fetches (filters, sort, Load more) and for search.
// The scope is a collection (?collection=…, with an optional ?tab=… on New, Women and Men), or a
// search (?q=…) when there's no collection. Everything else is parsed and normalised like the
// page's own URL, so a hand-edited request gets sensible results rather than an error.

const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=600";

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const collectionSlug = searchParams.get("collection");
  const tab = searchParams.get("tab") ?? undefined;

  let scope: ResultsScope;
  if (collectionSlug === null) {
    scope = { kind: "search", q: searchParams.get("q") ?? "" };
  } else {
    const categories = await getCategories();
    const collection = resolveCollection(collectionSlug, categories);
    if (!collection) return notFound();
    if (tab !== undefined && !(collection.hasTabs && categories.some((category) => category.slug === tab))) {
      return notFound();
    }
    scope = collection.scope;
  }

  const query = toResultsQuery(loadResultsParams(searchParams), scope, tab);
  const start = performance.now();
  const results = await getResults(query);
  const duration = (performance.now() - start).toFixed(1);

  return Response.json(results, {
    headers: { "Cache-Control": CACHE_CONTROL, "Server-Timing": `db;dur=${duration}` },
  });
}
