"use client";

import { Analytics } from "@vercel/analytics/next";
import { useEffect } from "react";

import { analyticsBeforeSend } from "@/lib/monitoring/analytics";
import { BOUNDARY_ERROR_EVENT } from "@/lib/monitoring/client-report";
import { createClientReporter, postClientReport } from "@/lib/monitoring/client-reporter";

/**
 * Browser errors and page views (M7). Errors that reach the window, unhandled rejections and the
 * error boundaries' `orra:error` events go to POST /api/client-errors, which relays them to Sentry,
 * so no Sentry code ships to the browser. `analytics` mounts Vercel Web Analytics (cookieless),
 * only on Vercel: elsewhere its script isn't served.
 */
export function Monitoring({ analytics }: { analytics: boolean }) {
  useEffect(() => {
    const report = createClientReporter(postClientReport, () => window.location.pathname);
    const onError = (event: ErrorEvent) => report(event.error ?? event.message, "window");
    const onRejection = (event: PromiseRejectionEvent) => report(event.reason, "rejection");
    const onBoundary = (event: Event) => report((event as CustomEvent<unknown>).detail, "boundary");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener(BOUNDARY_ERROR_EVENT, onBoundary);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener(BOUNDARY_ERROR_EVENT, onBoundary);
    };
  }, []);

  return analytics ? <Analytics beforeSend={analyticsBeforeSend} /> : null;
}
