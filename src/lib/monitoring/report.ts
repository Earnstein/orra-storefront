import "server-only";

import * as Sentry from "@sentry/nextjs";
import { after } from "next/server";

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
