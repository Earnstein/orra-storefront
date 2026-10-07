/**
 * `npm run db:clear-accounts`: deletes every account from DATABASE_URL (src/db/clear-accounts.ts).
 * Preview builds run it after seeding, because a preview's Neon branch is a copy of production's.
 *
 * Runs only against a database confirmed as NOT production (PRODUCTION_DB_HOST set and different).
 * There is no override. Builds its own client because src/db imports "server-only".
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";

import { clearAccounts } from "../src/db/clear-accounts";
import * as schema from "../src/db/schema";
import { clearAccountsGuardError, describeTarget } from "./db-target";

config({ path: [".env.local", ".env"], quiet: true });

const env = { databaseUrl: process.env.DATABASE_URL, productionDbHost: process.env.PRODUCTION_DB_HOST };

const refusal = clearAccountsGuardError(env);
if (refusal) {
  console.error(refusal);
  process.exit(1);
}
console.log(`Clearing accounts in DATABASE_URL (${describeTarget(env)}).`);

const db = drizzle({ client: neon(env.databaseUrl!), schema, casing: "snake_case" });

clearAccounts(db)
  .then(({ users }) => console.log(`Deleted ${users} accounts.`))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
