import type { BetterAuthOptions } from "better-auth";
import { nextCookies } from "better-auth/next-js";

/**
 * Better Auth options shared by the app (auth.ts) and the schema CLI (auth.cli.ts).
 * Add auth methods and plugins HERE, not in auth.ts, or `npm run auth:generate`
 * won't see the tables they need.
 */
export const authOptions = {
  // Enable auth methods (emailAndPassword, socialProviders, ...) when building auth flows.
  // nextCookies must stay last so Server Actions can set cookies.
  plugins: [nextCookies()],
} satisfies Omit<BetterAuthOptions, "database" | "secret" | "baseURL">;
