import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "@/db/schema";
import { seedCatalog, type SeedDatabase } from "@/db/seed";
import { MIGRATIONS_FOLDER } from "./migrations";
import { createPGlite } from "./pglite";

/**
 * A fresh in-memory Postgres for tests: the real migrations from ./drizzle are applied, then the
 * real seed is loaded. Each call is independent, so tests that write can't affect each other.
 */
export async function createTestDb(): Promise<SeedDatabase> {
  const db = drizzle({ client: createPGlite(), schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await seedCatalog(db);
  return db;
}
