import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { after } from "next/server";

import { db } from "@/db";
import { authOptions, resetPasswordSender } from "@/lib/auth.options";
import { sendEmail } from "@/lib/email/send";
import { authBaseUrl, serverEnv, trustedAuthOrigins } from "@/lib/env";

const env = serverEnv();

export const auth = betterAuth({
  ...authOptions,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: authBaseUrl(env),
  trustedOrigins: trustedAuthOrigins(env),
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    ...authOptions.emailAndPassword,
    sendResetPassword: resetPasswordSender(sendEmail),
  },
  rateLimit: {
    ...authOptions.rateLimit,
    // Off locally and in CI, where parallel tests all come from one IP.
    enabled: env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview",
  },
  advanced: {
    // Work Better Auth defers (such as sending the reset email) runs after the response is sent,
    // so a reset request answers as fast for unknown emails as for real ones. `after` keeps the
    // function alive until it finishes; a bare promise could be cut off on serverless.
    backgroundTasks: {
      handler: (promise) => {
        after(promise.catch((error: unknown) => console.error("[auth] background task failed:", error)));
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
