import "server-only";

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { after } from "next/server";

import { serverEnv } from "@/lib/env";
import type { SeedDatabase } from "./seed";
import * as schema from "./schema";

/**
 * Runs `fn` in one transaction. The Neon HTTP driver (`db`) has none, so this opens Neon's
 * WebSocket `Pool` for the request, as Neon advises on serverless (a pool can't outlive the
 * request), and closes it once the response is sent. Only stock holds and fulfilment use it;
 * every other read and write stays on HTTP. Node 22+ has the WebSocket this needs built in.
 */
export async function withTransaction<T>(fn: (tx: SeedDatabase) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: serverEnv().DATABASE_URL });
  after(() => pool.end());
  const db = drizzle({ client: pool, schema, casing: "snake_case" });
  return db.transaction((tx) => fn(tx));
}

/** How the checkout code runs a transaction; tests pass PGlite's `db.transaction` instead. */
export type Transact = <T>(fn: (tx: SeedDatabase) => Promise<T>) => Promise<T>;
