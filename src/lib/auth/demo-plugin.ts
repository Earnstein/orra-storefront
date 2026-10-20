import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

import { isDemoAdmin } from "./permissions";

// The public demo admin ("Try the admin"): one shared account, signed into by many visitors at
// once. Imported by auth.options.ts, so nothing here may import server-only modules.

/** A demo sign-in lasts 2 hours, however much it's used (the default session is 30 days). */
export const DEMO_SESSION_SECONDS = 2 * 60 * 60;

/** `.invalid` can never receive mail (RFC 2606); the demo account's address lives there. */
const RESERVED_EMAIL = /\.invalid$/i;

/**
 * Endpoints that would change, lock or watch the shared account: renaming it, setting a password,
 * listing or ending its sessions (one visitor signing every other visitor out). The demo role is
 * refused them; everyone else passes untouched.
 */
const SHARED_ACCOUNT_PATHS = new Set([
  "/update-user",
  "/change-email",
  "/change-password",
  "/set-password",
  "/delete-user",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/link-social",
  "/unlink-account",
]);

export function demoAdmin() {
  return {
    id: "demo-admin",
    endpoints: {
      /**
       * Signs this browser in as the demo account (server-only: POST /api/demo-admin checks the
       * origin and the rate limit, then calls it). Ends the browser's own session first, then
       * creates a session that isn't remembered: its cookie ends with the browser session, and
       * Better Auth never extends such a session, so it ends DEMO_SESSION_SECONDS after sign-in.
       */
      signInAsDemoAdmin: createAuthEndpoint.serverOnly({ method: "POST", body: z.object({ userId: z.string().min(1) }) }, async (ctx) => {
        const user = await ctx.context.internalAdapter.findUserById(ctx.body.userId);
        if (!user || !isDemoAdmin((user as { role?: string | null }).role)) {
          throw new APIError("FORBIDDEN", { message: "Only the demo account can be signed into this way." });
        }
        const previous = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
        if (previous) await ctx.context.internalAdapter.deleteSession(previous);
        const session = await ctx.context.internalAdapter.createSession(user.id, true, { expiresAt: new Date(Date.now() + DEMO_SESSION_SECONDS * 1000) }, true);
        await setSessionCookie(ctx, { session, user }, true);
        return ctx.json({ expiresAt: session.expiresAt });
      }),
    },
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/sign-up/email",
          handler: createAuthMiddleware(async (ctx) => {
            const email = typeof ctx.body?.email === "string" ? ctx.body.email.trim() : "";
            if (RESERVED_EMAIL.test(email)) throw new APIError("BAD_REQUEST", { code: "EMAIL_RESERVED", message: "Use another email address." });
          }),
        },
        {
          matcher: (ctx) => SHARED_ACCOUNT_PATHS.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx);
            if (session && isDemoAdmin((session.user as { role?: string | null }).role)) {
              throw new APIError("FORBIDDEN", { code: "DEMO_ACCOUNT", message: "The demo account can't be changed." });
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
