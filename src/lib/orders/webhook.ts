import "server-only";

import { sql } from "drizzle-orm";

import { rowsOf } from "@/lib/bag/queries";
import { releaseHold } from "@/lib/checkout/holds";
import { InvalidWebhookError } from "@/lib/payments/types";
import { fulfil, type FulfilDeps } from "./fulfil";

export type WebhookAnswer = { status: number; body: { received: boolean; error?: string } };

/**
 * Handles one payment webhook delivery (the raw body, so the signature can be checked):
 * - unverified → 400, nothing changes;
 * - an event already handled (`payment_events`) → 200, nothing more;
 * - a completed payment → `fulfil`; an expired one → its hold is released;
 * - a failure → 500, so the provider retries; the event is recorded only once it was handled.
 */
export async function handlePaymentWebhook(deps: FulfilDeps, rawBody: string, headers: Headers): Promise<WebhookAnswer> {
  let event;
  try {
    event = await deps.provider.parseWebhook(rawBody, headers);
  } catch (error) {
    if (error instanceof InvalidWebhookError) return { status: 400, body: { received: false, error: "invalid signature" } };
    throw error;
  }
  if (!event) return { status: 200, body: { received: true } };

  const seen = rowsOf<{ id: string }>(await deps.db.execute(sql`select id from payment_events where id = ${event.id}`));
  if (seen.length > 0) return { status: 200, body: { received: true } };

  try {
    // Found by the payment's reference, which only we stored: an event for a payment that isn't
    // one of ours (another app on the same account) is acknowledged and left alone.
    const [checkout] = rowsOf<{ id: string }>(await deps.db.execute(sql`select id from checkouts where payment_reference = ${event.reference}`));
    if (!checkout) console.warn("payments: a webhook for a payment we don't know", event.reference);
    else if (event.type === "payment.completed") {
      // Stripe says it completed: if the payment still reads as pending, ask for the event again later.
      if ((await fulfil(deps, checkout.id)).status === "pending") throw new Error("the payment is still pending");
    }
    else await releaseHold(deps.db, checkout.id);
  } catch (error) {
    console.error("payments: webhook handling failed", event.id, error instanceof Error ? error.message : error);
    return { status: 500, body: { received: false, error: "handling failed" } };
  }

  await deps.db.execute(sql`insert into payment_events (id, provider) values (${event.id}, ${deps.provider.name}) on conflict (id) do nothing`);
  return { status: 200, body: { received: true } };
}
