const MAX_LENGTH = 512;
const PLACEHOLDER_ORIGIN = "https://x.invalid";

/**
 * Where to send someone after signing in: `value` when it's a path on this site, otherwise
 * `fallback`. Rejects other hosts (`//evil.com`, `/\evil.com`, absolute URLs, `javascript:`),
 * anything that normalises into one (`/.//evil.com`), the sign-in and sign-up pages (no loops) and
 * values over 512 characters. Returns the normalised path, query and hash.
 */
export function safeReturnTo(value: string | null | undefined, fallback = "/account"): string {
  if (!value || value.length > MAX_LENGTH || !value.startsWith("/")) return fallback;

  let url: URL;
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;

  const path = `${url.pathname}${url.search}${url.hash}`;
  if (path.startsWith("//") || path.startsWith("/\\")) return fallback;
  if (isAuthPage(url.pathname)) return fallback;
  return path;
}

/** The sign-in page, coming back to `returnTo` afterwards. */
export function signInPath(returnTo: string): string {
  return `/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
}

/** The sign-in and sign-up pages (and the password pages under /sign-in), which never come back to themselves. */
export function isAuthPage(pathname: string): boolean {
  return ["/sign-in", "/sign-up"].some((page) => pathname === page || pathname.startsWith(`${page}/`));
}
