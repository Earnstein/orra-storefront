import "server-only";

import * as Sentry from "@sentry/nextjs";
import { after } from "next/server";

import type { ClientReport } from "./client-report";
import { scrubUrl } from "./scrub";

/** On Vercel the function can freeze once the response is sent, so events are flushed after it. */
function flushAfterResponse() {
  try {
    after(() => Sentry.flush(2000));
  } catch {
    // Outside a request (a script, a test): Sentry sends on its own schedule.
  }
}

/** Reports an error to Sentry; does nothing while monitoring is off (no `SENTRY_DSN`). */
export function reportError(error: unknown, context?: { tags?: Record<string, string> }): void {
  if (!Sentry.isInitialized()) return;
  Sentry.captureException(error, { tags: context?.tags });
  flushAfterResponse();
}

/** Reports something that went wrong without an exception, such as a reset step that failed. */
export function reportMessage(message: string, extra?: Record<string, unknown>): void {
  if (!Sentry.isInitialized()) return;
  Sentry.captureMessage(message, { level: "error", extra });
  flushAfterResponse();
}

/** Whether Sentry is set up (`SENTRY_DSN`); the client-error route skips its rate limit when it isn't. */
export function monitoringOn(): boolean {
  return Sentry.isInitialized();
}

/**
 * A browser error relayed by POST /api/client-errors. Its stack becomes frames (file, line,
 * column) where the server's parser reads it (Chrome's format); Firefox's and Safari's stay text.
 * Names stay minified: browser source maps aren't uploaded, since Sentry would inject an ID into
 * every browser chunk to match them. `beforeSend` scrubs it like any other event.
 */
export function reportClientError(report: ClientReport): void {
  if (!Sentry.isInitialized()) return;
  const frames = report.stack ? Sentry.defaultStackParser(report.stack) : [];
  Sentry.captureEvent({
    level: "error",
    platform: "javascript",
    exception: { values: [{ type: report.name, value: report.message, ...(frames.length > 0 && { stacktrace: { frames } }) }] },
    request: { url: scrubUrl(report.path).split("?")[0] },
    tags: { runtime: "browser", source: report.source },
    ...(frames.length === 0 && report.stack && { extra: { stack: report.stack } }),
  });
  flushAfterResponse();
}
