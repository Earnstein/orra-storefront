import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import type { SeedDatabase } from "@/db/seed";
import { authOptions, resetPasswordSender } from "@/lib/auth.options";
import type { Email } from "@/lib/email/send";
import { createTestDb } from "./db";

const TEST_PLUGINS_LEFT_OUT = new Set(["dash", "next-cookies"]);

/**
 * Better Auth with the app's options on a fresh PGlite (real migrations and seed). The Infra
 * dashboard and nextCookies (which needs a Next request) are left out, rate limits are off unless
 * asked for (they then count in the database's rate_limit table, as on Vercel), and
 * emails land in `outbox` instead of being sent. Background tasks are awaited, so the outbox is
 * filled by the time a call returns.
 */
export async function createTestAuth(db?: SeedDatabase, { rateLimit = false } = {}) {
  const database = db ?? (await createTestDb());
  const outbox: Email[] = [];
  const auth = betterAuth({
    ...authOptions,
    plugins: authOptions.plugins.filter((plugin) => !TEST_PLUGINS_LEFT_OUT.has(plugin.id)),
    secret: "test-secret-that-is-at-least-32-characters",
    baseURL: "http://localhost:3000",
    database: drizzleAdapter(database, { provider: "pg" }),
    emailAndPassword: {
      ...authOptions.emailAndPassword,
      sendResetPassword: resetPasswordSender(async (email) => {
        outbox.push(email);
      }),
    },
    rateLimit: { ...authOptions.rateLimit, enabled: rateLimit },
  });
  return { auth, db: database, outbox };
}

/** Turns a response's Set-Cookie headers into a Cookie header for the next request. */
export function cookiesFrom(headers: Headers): Headers {
  const cookie = headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .filter((pair) => !pair.endsWith("="))
    .join("; ");
  return new Headers({ cookie });
}
