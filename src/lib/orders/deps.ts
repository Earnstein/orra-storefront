import "server-only";

import { after } from "next/server";

import { db } from "@/db";
import { withTransaction } from "@/db/tx";
import { sendEmail } from "@/lib/email/send";
import { authBaseUrl, serverEnv } from "@/lib/env";
import { paymentProvider } from "@/lib/payments";
import type { FulfilDeps } from "./fulfil";

/** Fulfilment's real dependencies. Throws PaymentsUnavailableError until Stripe's keys are set. */
export function fulfilDeps(): FulfilDeps {
  const env = serverEnv();
  return {
    db,
    transact: withTransaction,
    provider: paymentProvider(),
    baseUrl: authBaseUrl(env),
    secret: env.BETTER_AUTH_SECRET,
    send: sendEmail,
    // The confirmation email goes out after the response, and isn't cut off on serverless.
    defer: (task) => after(task),
  };
}
