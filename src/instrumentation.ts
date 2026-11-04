import * as Sentry from "@sentry/nextjs";

import { monitoringOptions } from "@/lib/monitoring/options";

// Error monitoring (M7): Sentry on the server only. Browser errors reach it through our own
// POST /api/client-errors, so no Sentry code ships to the browser.
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { SENTRY_DSN, VERCEL_ENV, VERCEL_GIT_COMMIT_SHA } = process.env;
  const options = monitoringOptions({ SENTRY_DSN, VERCEL_ENV, VERCEL_GIT_COMMIT_SHA });
  if (options) Sentry.init(options);
}

// Errors from server components, route handlers, server actions and the proxy. A no-op while
// Sentry isn't initialised.
export const onRequestError = Sentry.captureRequestError;
