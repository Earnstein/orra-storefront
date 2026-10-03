import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { serverEnv } from "@/lib/env";
import * as schema from "./schema";

export const db = drizzle({
  client: neon(serverEnv().DATABASE_URL),
  schema,
  casing: "snake_case",
});

export type Database = typeof db;
