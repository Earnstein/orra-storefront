import { z } from "zod";

import { CLIENT_REPORT_LIMITS, type ClientReport } from "./client-report";

/** What POST /api/client-errors accepts (server side only; see client-report.ts). */
export const clientReportSchema = z.object({
  name: z.string().max(CLIENT_REPORT_LIMITS.name),
  message: z.string().max(CLIENT_REPORT_LIMITS.message),
  stack: z.string().max(CLIENT_REPORT_LIMITS.stack).optional(),
  // A path on this site; its query is dropped again on the server in case one slips through.
  path: z.string().max(CLIENT_REPORT_LIMITS.path).regex(/^\/(?!\/)/),
  source: z.enum(["window", "rejection", "boundary"]),
}) satisfies z.ZodType<ClientReport>;

const DAY = 24 * 60 * 60_000;
/**
 * The route's limits on Vercel, per address and for everyone, per day: enough to see a broken
 * page, but at most about 3,000 a month, so browser reports (rotating addresses included) can't
 * use up the free plan's 5,000 errors that server errors share.
 */
export const CLIENT_ERROR_LIMITS = { perAddress: { max: 20, windowMs: DAY }, overall: { max: 100, windowMs: DAY } };
