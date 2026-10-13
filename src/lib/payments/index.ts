import "server-only";

import { paymentsConfigured, serverEnv } from "@/lib/env";
import { createStripeClient, createStripeProvider } from "./stripe";
import { PaymentsUnavailableError, type PaymentProvider } from "./types";

export * from "./types";

let stripe: PaymentProvider | undefined;

/** The configured provider (Stripe). Throws PaymentsUnavailableError until its keys are set. */
export function paymentProvider(): PaymentProvider {
  const env = serverEnv();
  if (!paymentsConfigured(env)) throw new PaymentsUnavailableError();
  stripe ??= createStripeProvider({ client: createStripeClient(env.STRIPE_SECRET_KEY!), webhookSecret: env.STRIPE_WEBHOOK_SECRET });
  return stripe;
}
