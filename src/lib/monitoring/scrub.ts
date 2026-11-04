import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

/**
 * What Sentry may receive (M7 spec, Monitoring and analytics): no cookies, headers, bodies, query
 * strings or IP addresses, no email addresses in messages, and never a guest order key or a reset
 * token from a link. Shared by the server's `beforeSend` and the browser reports we relay.
 */

const SECRET_PARAMS = ["key", "token"];
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
// Better Auth's emailed reset link carries the token in the path.
const RESET_PATH = /(\/api\/auth\/reset-password\/)[^/?#]+/g;
// Links inside free text, as in "fetch failed: /orders/ORR-1?key=…".
const LINK_IN_TEXT = /(?:https?:\/\/[^\s?#]+|\/[^\s?#]*)\?[^\s#]*/g;

/** The URL without its `key` and `token` parameters; anything that isn't a URL comes back unchanged. */
export function scrubUrl(url: string): string {
  const relative = url.startsWith("/");
  let parsed: URL;
  try {
    parsed = new URL(url, relative ? "http://relative.invalid" : undefined);
  } catch {
    return url;
  }
  for (const name of SECRET_PARAMS) parsed.searchParams.delete(name);
  const path = parsed.pathname.replace(RESET_PATH, "$1[token]") + parsed.search + parsed.hash;
  return relative ? path : parsed.origin + path;
}

/** Free text with email addresses replaced and secret parameters dropped from any link in it. */
export function scrubText(text: string): string {
  return text.replace(EMAIL, "[email]").replace(RESET_PATH, "$1[token]").replace(LINK_IN_TEXT, (link) => scrubUrl(link));
}

const NOISE = [/^AbortError$/, /ResizeObserver loop/, /^Load failed$/, /^Failed to fetch$/, /^NetworkError when attempting to fetch resource\.?$/];
const EXTENSION_FRAME = /^(chrome|moz|safari(-web)?)-extension:/;

function isNoise(event: ErrorEvent): boolean {
  const texts = [event.message, ...(event.exception?.values ?? []).flatMap((value) => [value.type, value.value])];
  if (texts.some((text) => text && NOISE.some((pattern) => pattern.test(text)))) return true;
  const frames = (event.exception?.values ?? []).flatMap((value) => value.stacktrace?.frames ?? []);
  return frames.some((frame) => frame.filename && EXTENSION_FRAME.test(frame.filename));
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data && Object.fromEntries(
    Object.entries(breadcrumb.data).map(([name, value]) => [name, typeof value === "string" ? scrubText(value) : value]),
  );
  return { ...breadcrumb, message: breadcrumb.message && scrubText(breadcrumb.message), ...(data && { data }) };
}

/** Sentry's `beforeSend`: the event with everything above removed, or null for known noise. */
export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  if (isNoise(event)) return null;
  const rest = { ...event };
  delete rest.user;
  const request = event.request && {
    ...(event.request.url && { url: scrubUrl(event.request.url).split("?")[0] }),
    ...(event.request.method && { method: event.request.method }),
  };
  return {
    ...rest,
    ...(request && { request }),
    ...(event.message && { message: scrubText(event.message) }),
    ...(event.exception && {
      exception: { ...event.exception, values: event.exception.values?.map((value) => ({ ...value, value: value.value && scrubText(value.value) })) },
    }),
    ...(event.breadcrumbs && { breadcrumbs: event.breadcrumbs.map(scrubBreadcrumb) }),
  };
}
