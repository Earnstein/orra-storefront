import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { neon } from "@neondatabase/serverless";

import { databaseTarget } from "../scripts/db-target";

/**
 * SQL on the local e2e server's database, for states a shopper can't reach in a test's time (a
 * hold that ran out). Only for local runs (never with E2E_BASE_URL) against a database confirmed
 * as not production: PRODUCTION_DB_HOST from the environment or `.env` (only that value is taken
 * from it). Null otherwise, and tests that need it skip.
 */
export function testDatabase() {
  if (process.env.E2E_BASE_URL) return null;
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local: rely on the environment.
  }
  let productionDbHost = process.env.PRODUCTION_DB_HOST;
  if (!productionDbHost) {
    try {
      productionDbHost = parseEnv(readFileSync(".env", "utf8")).PRODUCTION_DB_HOST;
    } catch {
      // No .env: the target can't be confirmed, so no database.
    }
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseTarget({ databaseUrl, productionDbHost }) !== "other") return null;
  return neon(databaseUrl);
}
