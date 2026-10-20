import "server-only";

import { sql } from "drizzle-orm";

import type { SeedDatabase } from "@/db/seed";
import { rowsOf } from "@/lib/bag/queries";

/**
 * Counts one request under `key` in Better Auth's `rate_limit` table and answers whether it's
 * within `max` per `windowMs`. Our keys carry a prefix (`checkout:`, `demo-admin:`) no Better Auth
 * key can match. One statement, so simultaneous requests can't both read the old count. The
 * window starts with the first request and resets once it has passed.
 */
export async function withinLimit(db: SeedDatabase, key: string, { max, windowMs }: { max: number; windowMs: number }, now = Date.now()): Promise<boolean> {
  const windowStart = now - windowMs;
  const [row] = rowsOf<{ count: number }>(
    await db.execute(sql`
      insert into rate_limit (id, key, count, last_request)
      values (gen_random_uuid()::text, ${key}, 1, ${now})
      on conflict (key) do update set
        count = case when rate_limit.last_request < ${windowStart} then 1 else rate_limit.count + 1 end,
        last_request = case when rate_limit.last_request < ${windowStart} then ${now} else rate_limit.last_request end
      returning count`),
  );
  return Number(row?.count) <= max;
}

/** The client's address as Vercel reports it (it overwrites X-Forwarded-For; the first entry is the client). */
export function clientIp(headers: Headers): string | null {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

/** Our own limits count only on Vercel (production and previews), as Better Auth's do: local runs and CI share one IP. */
export function rateLimitsOn(env: { VERCEL_ENV?: string }): boolean {
  return env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";
}
