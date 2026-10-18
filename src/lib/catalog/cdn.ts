/**
 * Headers for the public catalogue routes (/api/products, /api/products/summaries,
 * /api/search/suggest): the CDN keeps them 5 minutes and serves a stale copy for 10 more while it
 * refreshes. The `catalog` cache tag lets the admin's saves purge them at once: on Next.js 16,
 * updateTag("catalog") in a server action also deletes Vercel CDN entries carrying that tag
 * (https://vercel.com/docs/caching/cdn-cache/purge). Vercel strips the tag header from responses.
 */
export const CATALOG_CDN_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
  "Vercel-Cache-Tag": "catalog",
} as const;
