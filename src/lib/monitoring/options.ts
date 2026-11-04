import type { NodeOptions } from "@sentry/nextjs";

import { scrubBreadcrumb, scrubEvent } from "./scrub";

type MonitoringEnv = { SENTRY_DSN?: string; VERCEL_ENV?: string; VERCEL_GIT_COMMIT_SHA?: string };

/**
 * Sentry's server options, or null when monitoring is off. The DSN is read here rather than in
 * `env.ts`, so a missing or malformed value turns monitoring off instead of stopping the site.
 * Sentry 11 collects IP addresses, cookies, headers, bodies and query strings by default; each is
 * turned off, and `scrubEvent` removes what's left (emails, order keys, reset tokens).
 */
export function monitoringOptions(env: MonitoringEnv): NodeOptions | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn || !URL.canParse(dsn)) return null;
  return {
    dsn,
    environment: env.VERCEL_ENV ?? "development",
    release: env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0,
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
