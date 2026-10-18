import { createLoader, parseAsInteger, parseAsString, parseAsStringLiteral, type inferParserType } from "nuqs/server";

// The admin products table's state lives in the URL (reload and Back keep it). Shared by the page
// (server), the table (client, useQueryStates) and GET /api/admin/products.

export const ADMIN_PRODUCT_SORTS = ["newest", "name", "price", "stock"] as const;
export type AdminProductSort = (typeof ADMIN_PRODUCT_SORTS)[number];
export const ADMIN_PAGE_SIZE = 25;

export const adminProductParsers = {
  q: parseAsString.withDefault(""),
  sort: parseAsStringLiteral(ADMIN_PRODUCT_SORTS).withDefault("newest"),
  dir: parseAsStringLiteral(["asc", "desc"] as const),
  status: parseAsStringLiteral(["active", "archived"] as const).withDefault("active"),
  page: parseAsInteger.withDefault(1),
};

export type AdminProductParams = inferParserType<typeof adminProductParsers>;
export const loadAdminProductParams = createLoader(adminProductParsers);

/** Each sort's natural direction when none is given: names A–Z, the rest highest/newest first. */
export function sortDirection(params: Pick<AdminProductParams, "sort" | "dir">): "asc" | "desc" {
  return params.dir ?? (params.sort === "name" ? "asc" : "desc");
}

/** The API path for a table state, with defaults left out so equal states share a cache entry. */
export function adminProductsPath(params: AdminProductParams): string {
  const search = new URLSearchParams();
  const q = params.q.trim();
  if (q) search.set("q", q);
  if (params.sort !== "newest") search.set("sort", params.sort);
  if (params.dir && params.dir !== sortDirection({ sort: params.sort, dir: null })) search.set("dir", params.dir);
  if (params.status !== "active") search.set("status", params.status);
  if (params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/api/admin/products?${query}` : "/api/admin/products";
}
