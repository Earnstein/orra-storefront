/**
 * Config for the Better Auth CLI only (`npm run auth:generate`). Never import this from app code.
 *
 * The real config (auth.ts) imports "server-only" via the db client, which the CLI can't load.
 * Schema generation only needs the adapter type and the shared options, so the db is a placeholder.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { authOptions } from "@/lib/auth.options";

export const auth = betterAuth({
  ...authOptions,
  database: drizzleAdapter({} as never, { provider: "pg" }),
});
