import { fulfilDeps } from "@/lib/orders/deps";
import { handlePaymentWebhook } from "@/lib/orders/webhook";
import { PaymentsUnavailableError } from "@/lib/payments/types";

/**
 * Stripe's webhook (`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
 * `checkout.session.expired`), verified on the raw body with `STRIPE_WEBHOOK_SECRET`.
 */
export async function POST(request: Request) {
  const started = performance.now();
  let deps;
  try {
    deps = fulfilDeps();
  } catch (error) {
    // Not configured here: 503, so Stripe retries once it is.
    if (error instanceof PaymentsUnavailableError) return Response.json({ received: false, error: "payments not configured" }, { status: 503 });
    throw error;
  }
  const { status, body } = await handlePaymentWebhook(deps, await request.text(), request.headers);
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "Server-Timing": `handle;dur=${Math.round(performance.now() - started)}` } });
}
