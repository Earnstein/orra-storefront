import "server-only";

import { sql } from "drizzle-orm";

import type { SeedDatabase } from "@/db/seed";
import { rowsOf } from "@/lib/bag/queries";

export const CHECKOUT_STARTS_PER_WINDOW = 5;
export const CHECKOUT_WINDOW_MS = 10 * 60_000;

/**
 * Counts one checkout start for this IP in Better Auth's `rate_limit` table (key `checkout:<ip>`,
 * which no Better Auth key can match) and answers whether it's within 5 per 10 minutes. One
 * statement, so simultaneous starts can't both read the old count. The window starts with the
 * first start and resets once it has passed.
 */
export async function allowCheckoutStart(db: SeedDatabase, ip: string, now = Date.now()): Promise<boolean> {
  const windowStart = now - CHECKOUT_WINDOW_MS;
  const [row] = rowsOf<{ count: number }>(
    await db.execute(sql`
      insert into rate_limit (id, key, count, last_request)
      values (gen_random_uuid()::text, ${`checkout:${ip}`}, 1, ${now})
      on conflict (key) do update set
        count = case when rate_limit.last_request < ${windowStart} then 1 else rate_limit.count + 1 end,
        last_request = case when rate_limit.last_request < ${windowStart} then ${now} else rate_limit.last_request end
      returning count`),
  );
  return Number(row?.count) <= CHECKOUT_STARTS_PER_WINDOW;
}
