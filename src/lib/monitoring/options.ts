import { captureConsoleIntegration, type NodeOptions } from "@sentry/nextjs";

import { scrubBreadcrumb, scrubEvent } from "./scrub";

type MonitoringEnv = { SENTRY_DSN?: string; VERCEL_ENV?: string; VERCEL_GIT_COMMIT_SHA?: string };

/**
 * Sentry's server options, or null when monitoring is off. The DSN is read here rather than in
 * `env.ts`, so a missing or malformed value turns monitoring off instead of stopping the site.
 * Sentry 11 collects IP addresses, cookies, headers, bodies and query strings by default; each is
 * turned off, and `scrubEvent` removes what's left (emails, order keys, reset tokens, query values).
 * No tracing: no sample rate (even 0 turns tracing on) and no trace headers on calls to Stripe,
 * Resend or Neon. `console.error` becomes an event, since the app catches and logs most failures
 * (webhook, checkout, capture, refunds) and Hobby keeps logs for an hour.
 */
export function monitoringOptions(env: MonitoringEnv): NodeOptions | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn || !URL.canParse(dsn)) return null;
  return {
    dsn,
    environment: env.VERCEL_ENV ?? "development",
    release: env.VERCEL_GIT_COMMIT_SHA,
    tracePropagationTargets: [],
    integrations: (defaults) => [...defaults, captureConsoleIntegration({ levels: ["error"] })],
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
    },
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
