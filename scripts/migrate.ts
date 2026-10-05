/**
 * `npm run db:migrate`: applies the ./drizzle migrations to DATABASE_URL with drizzle-kit, guarded.
 *
 * Run bare, drizzle-kit loads .env on startup, before drizzle.config.ts, and dotenv never overrides
 * a value that's set, so locally it would ignore .env.local and migrate production. This wrapper
 * resolves the env the way Next and db:seed do (.env.local, then .env), refuses the production
 * database unless run with `-- --production` or in a Vercel production build, then runs drizzle-kit
 * with exactly the env it checked.
 */
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

import { describeTarget, productionGuardError } from "./db-target";

// Read before the env files load: only the real environment of a Vercel build may allow production,
// never a VERCEL_ENV line in .env or .env.local.
const vercelEnv = process.env.VERCEL_ENV;
config({ path: [".env.local", ".env"], quiet: true });

const env = { databaseUrl: process.env.DATABASE_URL, productionDbHost: process.env.PRODUCTION_DB_HOST };
const production = process.argv.slice(2).includes("--production") ? "require" : vercelEnv === "production" ? "allow" : "refuse";

const refusal = productionGuardError({ ...env, production, action: "migrate" });
if (refusal) {
  console.error(refusal);
  process.exit(1);
}

console.log(`Migrating DATABASE_URL (${describeTarget(env)}).`);

const result = spawnSync("npx", ["--no", "--", "drizzle-kit", "migrate"], {
  stdio: "inherit",
  // The values drizzle-kit needs are already set above; pointing its own startup load at .env.local
  // means it can't add production values from .env for anything left unset.
  env: { ...process.env, DOTENV_CONFIG_PATH: ".env.local" },
});
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
