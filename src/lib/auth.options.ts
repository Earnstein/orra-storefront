import { dash } from "@better-auth/infra";
import type { BetterAuthOptions } from "better-auth";
import { nextCookies } from "better-auth/next-js";

/**
 * Better Auth options shared by the app (auth.ts) and the schema CLI (auth.cli.ts).
 * Add auth methods and plugins HERE, not in auth.ts, or `npm run auth:generate`
 * won't see the tables they need.
 */
export const authOptions = {
  emailAndPassword: { enabled: true },
  plugins: [
    // Better Auth Infra dashboard; reads BETTER_AUTH_API_KEY from the environment.
    dash(),
    // nextCookies must stay last so Server Actions can set cookies.
    nextCookies(),
  ],
} satisfies Omit<BetterAuthOptions, "database" | "secret" | "baseURL">;
