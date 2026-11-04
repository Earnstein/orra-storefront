/**
 * A browser error as the page reports it to POST /api/client-errors. The route forwards it to
 * Sentry from the server, so no Sentry code ships to the browser. This module is loaded on every
 * page with `<Monitoring />`, so it imports nothing: the route's Zod schema lives in
 * `client-report-schema.ts` (Zod alone is about 90 KB of browser JavaScript).
 */

export const CLIENT_REPORT_LIMITS = { name: 100, message: 500, stack: 8000, path: 512, bytes: 16_384 } as const;

/** The error boundaries' window event: they import nothing (the root one may only import React). */
export const BOUNDARY_ERROR_EVENT = "orra:error";

export type ClientReport = {
  name: string;
  message: string;
  stack?: string;
  /** A path on this site, without its query. */
  path: string;
  source: "window" | "rejection" | "boundary";
};
