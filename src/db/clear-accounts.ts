import { account, rateLimit, session, user, verification } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";

/**
 * Deletes every account: verification tokens, sessions, linked accounts, rate-limit counters and
 * users (their saved items go with them by cascade). The catalogue
 * is untouched. Run by preview builds (`npm run db:clear-accounts`), whose Neon branch starts as a
 * copy of production's, so previews never hold real shoppers' data.
 */
export async function clearAccounts(db: SeedDatabase): Promise<{ users: number }> {
  await db.delete(verification);
  await db.delete(session);
  await db.delete(account);
  await db.delete(rateLimit);
  const deleted = await db.delete(user).returning({ id: user.id });
  return { users: deleted.length };
}
