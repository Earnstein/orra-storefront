import "server-only";

import type { SeedDatabase } from "@/db/seed";
import { withinLimit } from "@/lib/rate-limit";

export const CHECKOUT_STARTS_PER_WINDOW = 5;
export const CHECKOUT_WINDOW_MS = 10 * 60_000;

/** Counts one checkout start for this IP (key `checkout:<ip>`): at most 5 per 10 minutes. */
export function allowCheckoutStart(db: SeedDatabase, ip: string, now = Date.now()): Promise<boolean> {
  return withinLimit(db, `checkout:${ip}`, { max: CHECKOUT_STARTS_PER_WINDOW, windowMs: CHECKOUT_WINDOW_MS }, now);
}
