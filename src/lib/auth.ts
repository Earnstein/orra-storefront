import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/db";
import { authOptions } from "@/lib/auth.options";
import { authBaseUrl, serverEnv, trustedAuthOrigins } from "@/lib/env";

const env = serverEnv();

export const auth = betterAuth({
  ...authOptions,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: authBaseUrl(env),
  trustedOrigins: trustedAuthOrigins(env),
  database: drizzleAdapter(db, { provider: "pg" }),
});

export type Session = typeof auth.$Infer.Session;
