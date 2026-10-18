import { sql } from "drizzle-orm";

import { user } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";

/**
 * Makes an existing account the store's owner (role `admin`), for `npm run admin:grant`. Emails
 * are stored lower-cased (Better Auth), so the match ignores case and surrounding spaces. Never
 * creates an account. The role is read uncached by every admin check, so it applies at once.
 */
export async function grantAdmin(db: SeedDatabase, email: string): Promise<"granted" | "unknown-email"> {
  const updated = await db
    .update(user)
    .set({ role: "admin" })
    .where(sql`${user.email} = ${email.trim().toLowerCase()}`)
    .returning({ id: user.id });
  return updated.length > 0 ? "granted" : "unknown-email";
}
