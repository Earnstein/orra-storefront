import { CLIENT_REPORT_LIMITS, type ClientReport } from "./client-report";

/** A page sends at most this many reports, each different, however often it errors. */
export const MAX_REPORTS_PER_PAGE = 5;

function describe(thrown: unknown): string {
  if (typeof thrown === "string") return thrown;
  try {
    return JSON.stringify(thrown) ?? String(thrown);
  } catch {
    return String(thrown);
  }
}

/** Anything thrown, as a report within the route's limits. */
export function toClientReport(thrown: unknown, source: ClientReport["source"], path: string): ClientReport {
  const error = thrown instanceof Error ? thrown : undefined;
  return {
    name: (error?.name || "Error").slice(0, CLIENT_REPORT_LIMITS.name),
    message: (error ? error.message : describe(thrown)).slice(0, CLIENT_REPORT_LIMITS.message),
    ...(error?.stack && { stack: error.stack.slice(0, CLIENT_REPORT_LIMITS.stack) }),
    path: path.split(/[?#]/)[0]!.slice(0, CLIENT_REPORT_LIMITS.path),
    source,
  };
}

/** A reporter for one page load: each distinct error once, at most `MAX_REPORTS_PER_PAGE`. */
export function createClientReporter(post: (report: ClientReport) => void, currentPath: () => string) {
  const sent = new Set<string>();
  return (thrown: unknown, source: ClientReport["source"]) => {
    if (sent.size >= MAX_REPORTS_PER_PAGE) return;
    const report = toClientReport(thrown, source, currentPath());
    const key = `${report.name}: ${report.message}`;
    if (sent.has(key)) return;
    sent.add(key);
    post(report);
  };
}

/** Fire and forget; `keepalive` lets a report sent as the page unloads still arrive. */
export function postClientReport(report: ClientReport): void {
  void fetch("/api/client-errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(report),
    keepalive: true,
  }).catch(() => {});
}
