import { getProductSummaries } from "@/lib/saved/queries";
import { isSlug, SAVED_LIMIT } from "@/lib/saved/limits";

/**
 * Product cards for a list of slugs (`?slug=a&slug=b`), in the order given; unknown and malformed
 * slugs are left out. Public and cacheable (the same for everyone); /saved sends its slugs sorted so
 * equal lists share a cache entry, then puts the cards back in its own order. At most SAVED_LIMIT.
 */
export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams.getAll("slug");
  if (asked.length > SAVED_LIMIT) {
    return Response.json({ error: `At most ${SAVED_LIMIT} slugs.` }, { status: 400 });
  }
  const slugs = [...new Set(asked.filter(isSlug))];
  const started = performance.now();
  const products = await getProductSummaries(slugs);
  return Response.json(
    { products },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        "Server-Timing": `db;dur=${Math.round(performance.now() - started)}`,
      },
    },
  );
}
