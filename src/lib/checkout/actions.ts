"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { withTransaction } from "@/db/tx";
import { isDemoAdmin } from "@/lib/auth/permissions";
import { emailSchema } from "@/lib/auth/schemas";
import { getCurrentSession } from "@/lib/auth/session";
import { readCartRef } from "@/lib/bag/request";
import { authBaseUrl, serverEnv, trustedAuthOrigins, type ServerEnv } from "@/lib/env";
import { paymentProvider } from "@/lib/payments";
import { clientIp, rateLimitsOn } from "@/lib/rate-limit";
import { startCheckoutWith, type StartResult } from "./start";

const startSchema = z.object({ email: emailSchema });

/**
 * Starts or resumes checkout for this request's bag (the signed-in user's, else the signed guest
 * cookie's): holds its stock and starts the payment. Sets no cookies (a cookie set in a server
 * action makes Next refetch the page); a lowered bag shows in its answer, and the header count
 * catches up on the next bag read.
 */
/**
 * Where Stripe sends the shopper back: the site they're on, if it's one we serve (a preview is
 * reached at its branch URL as well as its deployment URL, and the bag and session cookies are
 * host-only), else the canonical one.
 */
function returnOrigin(origin: string | null, env: ServerEnv): string {
  const ours = [authBaseUrl(env), ...trustedAuthOrigins(env)];
  return origin && ours.includes(origin) ? origin : authBaseUrl(env);
}

/** The start's answer, plus Stripe's publishable key on success (read at runtime, not built in). */
export type CheckoutStart = Exclude<StartResult, { ok: true }> | { ok: true; data: Extract<StartResult, { ok: true }>["data"] & { publishableKey: string } };

export async function startCheckout(input: { email: string }): Promise<CheckoutStart> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", reason: "email", message: parsed.error.issues[0]?.message ?? "Enter a valid email address." };

  // The shared demo admin can't buy: its orders (with the address typed in) would be readable by
  // every later demo visitor, and its one bag is everyone's.
  if (isDemoAdmin((await getCurrentSession())?.role)) {
    return { ok: false, error: "invalid", reason: "unavailable", message: "Checkout isn't part of the admin demo. Sign out of the demo to shop as yourself." };
  }
  const env = serverEnv();
  const cart = await readCartRef();
  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders);
  try {
    const result = await startCheckoutWith(
      {
        db,
        transact: withTransaction,
        provider: paymentProvider,
        rateLimit: rateLimitsOn(env),
        baseUrl: returnOrigin(requestHeaders.get("origin"), env),
      },
      { cart, email: parsed.data.email, ip },
    );
    // Payments are configured whenever a start succeeds, so the key is set.
    return result.ok ? { ok: true, data: { ...result.data, publishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY! } } : result;
  } catch (error) {
    console.error("checkout: start failed", error instanceof Error ? error.message : error);
    return { ok: false, error: "failed", message: "Something went wrong. Try again." };
  }
}
