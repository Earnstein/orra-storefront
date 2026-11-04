import type { Breadcrumb, ErrorEvent, StackFrame } from "@sentry/nextjs";

/**
 * What Sentry may receive (M7 spec, Monitoring and analytics): no cookies, headers, bodies, query
 * strings or IP addresses, no email addresses, no values bound to a database query, and never a
 * guest order key or a reset token from a link. Every string in an event is scrubbed, wherever
 * Sentry put it (messages, exceptions and their causes, frames, breadcrumbs, extra, contexts,
 * tags). Shared by the server's `beforeSend` and the browser reports we relay.
 */

const SECRET_PARAMS = ["key", "token"];
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
// Better Auth's emailed reset link carries the token in the path.
const RESET_PATH = /(\/api\/auth\/reset-password\/)[^/?#\s]+/g;
// Links inside free text, as in "fetch failed: /orders/ORR-1?key=…".
const LINK_IN_TEXT = /(?:https?:\/\/[^\s?#]+|\/[^\s?#]*)\?[^\s#]*/g;
// Drizzle's query errors end with the bound values ("Failed query: …\nparams: …"): session tokens,
// names, addresses, password hashes.
const QUERY_PARAMS = /\nparams:[\s\S]*$/;

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

/** Free text with email addresses replaced, query values dropped and secret parameters removed from links. */
export function scrubText(text: string): string {
  return text
    .replace(QUERY_PARAMS, "\nparams: [removed]")
    .replace(EMAIL, "[email]")
    .replace(RESET_PATH, "$1[token]")
    .replace(LINK_IN_TEXT, (link) => scrubUrl(link));
}

/** Every string inside `value`, scrubbed (objects and arrays a few levels deep; deeper is dropped). */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubText(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= 6) return "[removed]";
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, scrubValue(item, depth + 1)]));
}

/** A URL without any query: frames and requests never need one. */
const withoutQuery = (url: string) => url.split(/[?#]/)[0]!;

function scrubFrame(frame: StackFrame): StackFrame {
  return {
    ...(scrubValue(frame) as StackFrame),
    ...(frame.filename && { filename: withoutQuery(scrubUrl(frame.filename)) }),
    ...(frame.abs_path && { abs_path: withoutQuery(scrubUrl(frame.abs_path)) }),
  };
}

const NOISE = [
  /^AbortError$/,
  /ResizeObserver loop/,
  // Cross-origin script errors arrive as "Script error." with nothing to act on.
  /^Script error\.?$/,
  /^Load failed$/,
  /^Failed to fetch$/,
  /^NetworkError when attempting to fetch resource\.?$/,
  // Until there's a sending domain, Resend's test sender refuses every address but the owner's.
  /^\[email\] failed to send to=/,
];
const EXTENSION_FRAME = /^(chrome|moz|safari(-web)?)-extension:/;

function isNoise(event: ErrorEvent): boolean {
  const texts = [event.message, event.logentry?.message, ...(event.exception?.values ?? []).flatMap((value) => [value.type, value.value])];
  if (texts.some((text) => text && NOISE.some((pattern) => pattern.test(text)))) return true;
  const frames = (event.exception?.values ?? []).flatMap((value) => value.stacktrace?.frames ?? []);
  return frames.some((frame) => frame.filename && EXTENSION_FRAME.test(frame.filename));
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  // A console breadcrumb keeps the raw arguments too; its message already holds them as text.
  const data = { ...breadcrumb.data };
  delete data.arguments;
  return {
    ...breadcrumb,
    ...(breadcrumb.message && { message: scrubText(breadcrumb.message) }),
    ...(breadcrumb.data && { data: scrubValue(data) as Breadcrumb["data"] }),
  };
}

/** Sentry's `beforeSend`: the event with everything above removed, or null for known noise. */
export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  if (isNoise(event)) return null;
  const { request, exception, breadcrumbs, ...rest } = event;
  delete rest.user;
  const scrubbed = scrubValue(rest) as ErrorEvent;
  return {
    ...scrubbed,
    ...(request && {
      request: {
        ...(request.url && { url: withoutQuery(scrubUrl(request.url)) }),
        ...(request.method && { method: request.method }),
      },
    }),
    ...(exception && {
      exception: {
        ...exception,
        values: exception.values?.map((value) => ({
          ...value,
          ...(value.value && { value: scrubText(value.value) }),
          ...(value.stacktrace && { stacktrace: { ...value.stacktrace, frames: value.stacktrace.frames?.map(scrubFrame) } }),
        })),
      },
    }),
    ...(breadcrumbs && { breadcrumbs: breadcrumbs.map(scrubBreadcrumb) }),
  };
}
