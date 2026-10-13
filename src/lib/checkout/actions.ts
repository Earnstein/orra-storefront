"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { withTransaction } from "@/db/tx";
import { emailSchema } from "@/lib/auth/schemas";
import { readCartRef } from "@/lib/bag/request";
import { authBaseUrl, serverEnv } from "@/lib/env";
import { paymentProvider } from "@/lib/payments";
import { startCheckoutWith, type StartResult } from "./start";

const startSchema = z.object({ email: emailSchema });

/**
 * Starts or resumes checkout for this request's bag (the signed-in user's, else the signed guest
 * cookie's): holds its stock and starts the payment. Sets no cookies (a cookie set in a server
 * action makes Next refetch the page); a lowered bag shows in its answer, and the header count
 * catches up on the next bag read.
 */
/** The start's answer, plus Stripe's publishable key on success (read at runtime, not built in). */
export type CheckoutStart = Exclude<StartResult, { ok: true }> | { ok: true; data: Extract<StartResult, { ok: true }>["data"] & { publishableKey: string } };

export async function startCheckout(input: { email: string }): Promise<CheckoutStart> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", reason: "email", message: parsed.error.issues[0]?.message ?? "Enter a valid email address." };

  const env = serverEnv();
  const cart = await readCartRef();
  // The client's address, as Better Auth reads it: Vercel puts it first.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  try {
    const result = await startCheckoutWith(
      {
        db,
        transact: withTransaction,
        provider: paymentProvider,
        rateLimit: env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview",
        baseUrl: authBaseUrl(env),
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
