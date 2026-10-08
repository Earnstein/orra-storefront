// Client-safe limits for saved items, shared by the server (validation, the cap) and the browser.

/** An account holds at most this many saved items, and a request carries at most this many slugs. */
export const SAVED_LIMIT = 200;

/** A product slug: lower-case words of letters and digits joined by single hyphens, at most 100 characters. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 100;

export function isSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= SLUG_MAX && SLUG_PATTERN.test(value);
}
