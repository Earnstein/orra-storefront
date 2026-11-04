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
