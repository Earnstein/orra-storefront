import { safeReturnTo } from "@/lib/auth/return-to";

type Meta = { errors: unknown[] };

/**
 * The errors to show under a field: none until the form has been submitted, then kept current as
 * the visitor types (forms validate on change). Not on blur: an error appearing as focus leaves a
 * field pushes the submit button down between mousedown and mouseup, so the click is lost.
 * Zod (Standard Schema) issues carry a `message`.
 */
export function shownErrors(meta: Meta, submitted: boolean): { message?: string }[] {
  if (!submitted) return [];
  return meta.errors.map((error) => (typeof error === "string" ? { message: error } : (error as { message?: string })));
}

/**
 * Leaves the sign-in page for `?returnTo` (a path on this site, else /account) with a full page
 * load. Signing in changes what every page renders, and the client router may hold prefetches made
 * while signed out (an /account prefetch is the proxy's redirect back to sign-in).
 */
export function leaveSignIn() {
  window.location.replace(safeReturnTo(new URLSearchParams(window.location.search).get("returnTo")));
}

/** An aria-describedby value from the ids that apply (hint, error), or undefined when none do. */
export function describedBy(...ids: (string | false | undefined)[]): string | undefined {
  const present = ids.filter(Boolean);
  return present.length > 0 ? present.join(" ") : undefined;
}

/** Whether a field's last validation failed (TanStack Form field meta; undefined before it mounts). */
export function hasErrors(meta: { errors: unknown[] } | undefined): boolean {
  return (meta?.errors.length ?? 0) > 0;
}

/**
 * Focuses the first field, in form order, whose validation failed. Reads the form's state rather
 * than the DOM, so it doesn't depend on React having rendered the errors yet.
 */
export function focusFirstInvalid(fields: [name: string, id: string][], hasErrors: (name: string) => boolean) {
  const first = fields.find(([name]) => hasErrors(name));
  if (first) document.getElementById(first[1])?.focus();
}
