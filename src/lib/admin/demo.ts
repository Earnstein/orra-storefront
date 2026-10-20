import "server-only";

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import type { SeedDatabase } from "@/db/seed";
import { rowsOf } from "@/lib/bag/queries";
import { withinLimit } from "@/lib/rate-limit";

/** The shared demo account. `.invalid` can't receive mail, and sign-up refuses that domain. */
export const DEMO_ADMIN_EMAIL = "demo-admin@orra.invalid";
const DEMO_ADMIN_NAME = "Demo admin";
export const DEMO_SIGN_INS_PER_WINDOW = 5;
export const DEMO_WINDOW_MS = 10 * 60_000;

/**
 * The demo account, created on first use with the `demo-admin` role and no password (so nobody can
 * sign into it but through "Try the admin", and it can't be deleted, which needs one). Safe to
 * call at the same moment twice. If the address was ever registered some other way, the account is
 * taken back in the same statement: role and name reset, its password removed and its sessions
 * ended, so whoever registered it can't sign in or name what every demo visitor sees.
 */
export async function ensureDemoAdmin(db: SeedDatabase): Promise<{ id: string }> {
  const [row] = rowsOf<{ id: string; taken_back: number }>(
    await db.execute(sql`
      with demo as (
        insert into "user" (id, name, email, email_verified, role, created_at, updated_at)
        values (${randomUUID()}, ${DEMO_ADMIN_NAME}, ${DEMO_ADMIN_EMAIL}, true, 'demo-admin', now(), now())
        on conflict (email) do update set role = 'demo-admin', name = ${DEMO_ADMIN_NAME}
        returning id
      ), passwords as (
        delete from account where user_id in (select id from demo) returning user_id
      ), sessions as (
        delete from session where user_id in (select user_id from passwords)
      )
      select id, (select count(*)::int from passwords) as taken_back from demo`),
  );
  if (Number(row!.taken_back) > 0) console.warn("demo-admin: the demo address had been registered; took the account back");
  return { id: row!.id };
}

/** Counts one demo sign-in for this IP (key `demo-admin:<ip>`): at most 5 per 10 minutes. */
export function allowDemoSignIn(db: SeedDatabase, ip: string, now = Date.now()): Promise<boolean> {
  return withinLimit(db, `demo-admin:${ip}`, { max: DEMO_SIGN_INS_PER_WINDOW, windowMs: DEMO_WINDOW_MS }, now);
}

/** What the public demo may add in a day from one network (it resets nightly with the catalogue). */
export const DEMO_DAILY_LIMITS = { upload: 30, create: 20 } as const;
const DAY_MS = 24 * 60 * 60_000;

/** Counts one demo photo upload or new product for this IP (key `demo-upload:<ip>` / `demo-create:<ip>`). */
export function allowDemoWrite(db: SeedDatabase, kind: keyof typeof DEMO_DAILY_LIMITS, ip: string, now = Date.now()): Promise<boolean> {
  return withinLimit(db, `demo-${kind}:${ip}`, { max: DEMO_DAILY_LIMITS[kind], windowMs: DAY_MS }, now);
}
