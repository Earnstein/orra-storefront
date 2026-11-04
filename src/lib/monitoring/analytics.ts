import type { BeforeSendEvent } from "@vercel/analytics/next";

import { scrubUrl } from "./scrub";

/** Vercel Web Analytics' `beforeSend`: guest order links and reset links lose their key and token. */
export function analyticsBeforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  return { ...event, url: scrubUrl(event.url) };
}
