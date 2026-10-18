import { CATALOG_CDN_HEADERS } from "@/lib/catalog/cdn";
import { getSuggestions } from "@/lib/catalog/suggest";

// Suggestions for the header search panel (?q=…), cached like /api/products. Text with nothing
// searchable in it gets empty suggestions, not an error.

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const start = performance.now();
  const suggestions = await getSuggestions(q);
  const duration = (performance.now() - start).toFixed(1);

  return Response.json(suggestions, {
    headers: { ...CATALOG_CDN_HEADERS, "Server-Timing": `db;dur=${duration}` },
  });
}
