import "server-only";

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import type { SeedDatabase } from "@/db/seed";
import { rowsOf } from "@/lib/bag/queries";
import { withinLimit } from "@/lib/rate-limit";

/** The shared demo account. `.invalid` can't receive mail, and sign-up refuses that domain. */
export const DEMO_ADMIN_EMAIL = "demo-admin@orra.invalid";
export const DEMO_SIGN_INS_PER_WINDOW = 5;
export const DEMO_WINDOW_MS = 10 * 60_000;

/**
 * The demo account, created on first use with the `demo-admin` role and no password (so nobody can
 * sign into it but through "Try the admin", and it can't be deleted, which needs one). Safe to
 * call at the same moment twice; it also puts the role back if something changed it.
 */
export async function ensureDemoAdmin(db: SeedDatabase): Promise<{ id: string }> {
  const [row] = rowsOf<{ id: string }>(
    await db.execute(sql`
      insert into "user" (id, name, email, email_verified, role, created_at, updated_at)
      values (${randomUUID()}, 'Demo admin', ${DEMO_ADMIN_EMAIL}, true, 'demo-admin', now(), now())
      on conflict (email) do update set role = 'demo-admin'
      returning id`),
  );
  return { id: row!.id };
}

/** Counts one demo sign-in for this IP (key `demo-admin:<ip>`): at most 5 per 10 minutes. */
export function allowDemoSignIn(db: SeedDatabase, ip: string, now = Date.now()): Promise<boolean> {
  return withinLimit(db, `demo-admin:${ip}`, { max: DEMO_SIGN_INS_PER_WINDOW, windowMs: DEMO_WINDOW_MS }, now);
}
