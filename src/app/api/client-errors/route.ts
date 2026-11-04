import { db } from "@/db";
import { serverEnv } from "@/lib/env";
import { CLIENT_REPORT_LIMITS } from "@/lib/monitoring/client-report";
import { CLIENT_ERROR_LIMITS, clientReportSchema } from "@/lib/monitoring/client-report-schema";
import { monitoringOn, reportClientError } from "@/lib/monitoring/report";
import { clientIp, rateLimitsOn, withinLimit } from "@/lib/rate-limit";

const PRIVATE = { "Cache-Control": "private, no-store" };
const answer = (status: number) => new Response(null, { status, headers: PRIVATE });

/**
 * POST /api/client-errors: a browser error from our own pages (`<Monitoring />`), forwarded to
 * Sentry from the server. Same origin only, with an Origin required; size-checked before it's
 * parsed; answers 204 whether or not monitoring is on, so the page learns nothing either way.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return answer(403);

  if (Number(request.headers.get("content-length") ?? 0) > CLIENT_REPORT_LIMITS.bytes) return answer(413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > CLIENT_REPORT_LIMITS.bytes) return answer(413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return answer(400);
  }
  const report = clientReportSchema.safeParse(body);
  if (!report.success) return answer(400);
  if (!monitoringOn()) return answer(204);

  if (rateLimitsOn(serverEnv())) {
    const address = `client-error:${clientIp(request.headers) ?? "unknown"}`;
    if (!(await withinLimit(db, address, CLIENT_ERROR_LIMITS.perAddress))) return answer(429);
    if (!(await withinLimit(db, "client-error:all", CLIENT_ERROR_LIMITS.overall))) return answer(429);
  }
  reportClientError(report.data, origin);
  return answer(204);
}
