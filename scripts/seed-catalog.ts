/**
 * `npm run db:seed`: loads the initial catalogue (src/db/seed) into DATABASE_URL.
 * Safe to re-run: rows are upserted by slug, which resets those products' content and stock to
 * the seed values. Products not in the seed are left alone.
 *
 * Refuses the production database (PRODUCTION_DB_HOST) unless run with `-- --production`.
 * `-- --check` prints which database DATABASE_URL points at, without connecting.
 *
 * Builds its own client because src/db imports "server-only", which can't load outside Next.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "../src/db/schema";
import { seedCatalog } from "../src/db/seed";
import { databaseTarget, productionGuardError } from "./db-target";

config({ path: [".env.local", ".env"], quiet: true });

const flags = new Set(process.argv.slice(2));
const env = { databaseUrl: process.env.DATABASE_URL, productionDbHost: process.env.PRODUCTION_DB_HOST };

if (flags.has("--check")) {
  const target = databaseTarget(env);
  if (target === "production") console.log("production");
  else if (target === "other") console.log("not production");
  else if (!env.productionDbHost?.trim()) console.log("unknown (PRODUCTION_DB_HOST is not set)");
  else console.log("unknown (DATABASE_URL is missing or not a URL)");
  process.exit(0);
}

const url = env.databaseUrl;
if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");

const refusal = productionGuardError({ ...env, allowProduction: flags.has("--production"), action: "seed" });
if (refusal) {
  console.error(refusal);
  process.exit(1);
}

const db = drizzle({ client: neon(url), schema, casing: "snake_case" });

seedCatalog(db)
  .then((seeded) => console.log(`Seeded ${seeded.categories} categories and ${seeded.products} products.`))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
