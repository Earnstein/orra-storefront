import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/db";
import { authOptions } from "@/lib/auth.options";
import { serverEnv } from "@/lib/env";

const env = serverEnv();

export const auth = betterAuth({
  ...authOptions,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg" }),
});

export type Session = typeof auth.$Infer.Session;
