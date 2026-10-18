/**
 * `npm run admin:grant -- <email>`: makes an existing account the store's owner (role `admin`;
 * src/db/grant-admin.ts). The owner signs up on the site first, then runs this once.
 *
 * Refuses the production database (PRODUCTION_DB_HOST) unless run with `--production`, which in
 * turn refuses any database not confirmed as production:
 * `npm run admin:grant -- you@example.com --production`.
 *
 * Builds its own client because src/db imports "server-only", which can't load outside Next.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";

import { grantAdmin } from "../src/db/grant-admin";
import * as schema from "../src/db/schema";
import { describeTarget, productionGuardError } from "./db-target";

config({ path: [".env.local", ".env"], quiet: true });

const args = process.argv.slice(2);
const emails = args.filter((arg) => !arg.startsWith("--"));
const env = { databaseUrl: process.env.DATABASE_URL, productionDbHost: process.env.PRODUCTION_DB_HOST };

if (emails.length !== 1 || !emails[0].includes("@")) {
  console.error("Usage: npm run admin:grant -- <email> [--production]");
  process.exit(1);
}
if (!env.databaseUrl) throw new Error("DATABASE_URL is not set (see .env.example)");

const refusal = productionGuardError({ ...env, production: args.includes("--production") ? "require" : "refuse", action: "update roles in" });
if (refusal) {
  console.error(refusal);
  process.exit(1);
}
console.log(`Granting the admin role in DATABASE_URL (${describeTarget(env)}).`);

const db = drizzle({ client: neon(env.databaseUrl), schema, casing: "snake_case" });

grantAdmin(db, emails[0])
  .then((result) => {
    if (result === "unknown-email") {
      console.error("No account has that email. Sign up on the site first, then run this again.");
      process.exit(1);
    }
    console.log("Done: that account is now the store's admin.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
