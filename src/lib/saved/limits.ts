// Client-safe limits for saved items, shared by the server (validation, the cap) and the browser.

/** An account holds at most this many saved items, and a request carries at most this many slugs. */
export const SAVED_LIMIT = 200;

/** A product slug: lower-case words of letters and digits joined by single hyphens, at most 100 characters. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 100;

export function isSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= SLUG_MAX && SLUG_PATTERN.test(value);
}

/**
 * The batch of browser-saved slugs to merge into an account: the newest SAVED_LIMIT distinct
 * valid slugs, oldest first. The browser list is oldest first (each save appends), so a longer
 * list is merged in part rather than rejected, and malformed entries never fail the request.
 */
export function mergeBatch(local: readonly string[]): string[] {
  const seen = new Set<string>();
  const newestFirst: string[] = [];
  for (let i = local.length - 1; i >= 0 && newestFirst.length < SAVED_LIMIT; i--) {
    const slug = local[i];
    if (!isSlug(slug) || seen.has(slug)) continue;
    seen.add(slug);
    newestFirst.push(slug);
  }
  return newestFirst.reverse();
}
