import { getSuggestions } from "@/lib/catalog/suggest";

// Suggestions for the header search panel (?q=…), cached like /api/products. Text with nothing
// searchable in it gets empty suggestions, not an error.

const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=600";

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const start = performance.now();
  const suggestions = await getSuggestions(q);
  const duration = (performance.now() - start).toFixed(1);

  return Response.json(suggestions, {
    headers: { "Cache-Control": CACHE_CONTROL, "Server-Timing": `db;dur=${duration}` },
  });
}
