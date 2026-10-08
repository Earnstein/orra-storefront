import { dash } from "@better-auth/infra";
import type { BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/password";
import type { Email } from "@/lib/email/send";
import { resetPasswordEmail } from "@/lib/email/templates";

const DAY = 60 * 60 * 24;

/**
 * Better Auth options shared by the app (auth.ts) and the schema CLI (auth.cli.ts).
 * Add auth methods and plugins HERE, not in auth.ts, or `npm run auth:generate`
 * won't see the tables they need. Settings that need the environment or server-only
 * modules (secret, base URL, sending email, whether rate limits are on) live in auth.ts.
 */
export const authOptions = {
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN,
    maxPasswordLength: PASSWORD_MAX,
    // No sending domain until M7, so sign-up can't wait for a verification email.
    requireEmailVerification: false,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
  },
  session: {
    // "Stay signed in" off passes rememberMe: false, which makes it a browser-session cookie.
    expiresIn: 30 * DAY,
    // Browser session reads skip the database for 5 minutes. A session revoked elsewhere stays
    // accepted by those reads until then; getCurrentUser() skips the cache for server-side checks.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  user: {
    // Deleting needs the current password: Better Auth checks it when it's sent, and the
    // `hooks.before` below refuses a request without one (Better Auth alone would accept a
    // session under a day old instead).
    deleteUser: { enabled: true },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/delete-user" && !ctx.body?.password) {
        throw new APIError("BAD_REQUEST", { code: "PASSWORD_REQUIRED", message: "Enter your password to delete your account." });
      }
    }),
  },
  rateLimit: {
    // Serverless instances don't share memory, so the counters live in the `rateLimit` table.
    // auth.ts turns the limits on for Vercel production and previews only.
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/request-password-reset": { window: 15 * 60, max: 3 },
      // Every page's header reads the session; with database storage the default rule would add a
      // read and a write per page view, which the cookie cache exists to avoid.
      "/get-session": false,
    },
  },
  plugins: [
    // Better Auth Infra dashboard; reads BETTER_AUTH_API_KEY from the environment.
    dash(),
    // nextCookies must stay last so Server Actions can set cookies.
    nextCookies(),
  ],
} satisfies Omit<BetterAuthOptions, "database" | "secret" | "baseURL">;

/**
 * Builds `emailAndPassword.sendResetPassword` around a sender, so the app passes the real
 * `sendEmail` and tests pass an in-memory outbox.
 */
export function resetPasswordSender(send: (email: Email) => Promise<void>) {
  return async ({ user, url }: { user: { email: string }; url: string }) => {
    await send({ to: user.email, ...resetPasswordEmail({ url }) });
  };
}
