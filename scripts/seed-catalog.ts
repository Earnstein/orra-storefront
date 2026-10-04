/**
 * `npm run db:seed`: loads the initial catalogue (src/db/seed) into DATABASE_URL.
 * Safe to re-run: rows are upserted by slug, which resets those products' content and stock to
 * the seed values. Products not in the seed are left alone.
 *
 * Builds its own client because src/db imports "server-only", which can't load outside Next.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "../src/db/schema";
import { seedCatalog } from "../src/db/seed";

config({ path: [".env.local", ".env"], quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");

const db = drizzle({ client: neon(url), schema, casing: "snake_case" });

seedCatalog(db)
  .then((seeded) => console.log(`Seeded ${seeded.categories} categories and ${seeded.products} products.`))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
