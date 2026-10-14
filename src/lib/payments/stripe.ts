import "server-only";

import Stripe from "stripe";

import {
  InvalidWebhookError,
  type PaymentCheck,
  type PaymentEvent,
  type PaymentProvider,
  type PaymentStatus,
  type ShippingAddress,
  type StartPaymentInput,
} from "./types";

/** Pinned so a Stripe account upgrade can't change what these calls return. */
export const STRIPE_API_VERSION = "2026-09-30.endive" as const;

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, appInfo: { name: "orra-storefront" } });
}

/**
 * Everything the account offers except cards (with Apple Pay and Google Pay where the domain
 * allows) and Link, which authorise at once and can be captured later. This API version has no
 * allowlist on sessions, so the rest are excluded by name (the SDK's list for 2026-09-30.endive);
 * a method Stripe adds later needs adding here, or turning off in the dashboard.
 */
export const EXCLUDED_PAYMENT_METHODS: Stripe.Checkout.SessionCreateParams.ExcludedPaymentMethodType[] = [
  "acss_debit", "affirm", "afterpay_clearpay", "alipay", "alma", "amazon_pay", "au_becs_debit", "bacs_debit", "bancontact", "billie",
  "bizum", "blik", "boleto", "cashapp", "crypto", "customer_balance", "eps", "fpx", "giropay", "grabpay", "ideal", "kakao_pay",
  "klarna", "konbini", "kr_card", "mb_way", "mobilepay", "multibanco", "naver_pay", "nz_bank_account", "oxxo", "p24", "pay_by_bank",
  "payco", "paynow", "paypal", "paypay", "payto", "pix", "promptpay", "revolut_pay", "samsung_pay", "satispay", "scalapay",
  "sepa_debit", "sequra", "sofort", "sunbit", "swish", "twint", "upi", "us_bank_account", "wechat_pay", "zip",
];

const COMPLETED = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);
const EXPIRED = new Set(["checkout.session.expired"]);

const BRANDS: Record<string, string> = {
  amex: "American Express",
  cartes_bancaires: "Cartes Bancaires",
  diners: "Diners Club",
  discover: "Discover",
  eftpos_au: "eftpos",
  jcb: "JCB",
  link: "Link",
  mastercard: "Mastercard",
  unionpay: "UnionPay",
  visa: "Visa",
};

/**
 * The Stripe provider: a Checkout Session in `elements` mode (our own page, Stripe's fields) that
 * only authorises (`capture_method: "manual"`), so fulfilment can take the money once the order is
 * safe, or let it go. The session's id is the payment reference.
 */
export function createStripeProvider({ client, webhookSecret }: { client: Stripe; webhookSecret: string | undefined }): PaymentProvider {
  /** The session with its PaymentIntent and payment method, which every later call reads. */
  async function read(reference: string) {
    const session = await client.checkout.sessions.retrieve(reference, { expand: ["payment_intent.payment_method"] });
    const intent = typeof session.payment_intent === "object" ? session.payment_intent : null;
    return { session, intent };
  }

  return {
    name: "stripe",

    async startPayment(input: StartPaymentInput) {
      const session = await client.checkout.sessions.create(
        {
          ui_mode: "elements",
          mode: "payment",
          excluded_payment_method_types: EXCLUDED_PAYMENT_METHODS,
          line_items: input.lines.map((line) => ({
            quantity: line.quantity,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: line.unitPrice,
              product_data: { name: line.name },
            },
          })),
          customer_email: input.email,
          client_reference_id: input.checkoutId,
          metadata: { checkout_id: input.checkoutId },
          payment_intent_data: { capture_method: "manual", metadata: { checkout_id: input.checkoutId } },
          shipping_address_collection: { allowed_countries: ["US"] },
          // A phone number for the courier. Without one, Stripe.js copies an empty phone into the
          // billing details ("Billing is same as shipping") and its own API rejects the payment.
          phone_number_collection: { enabled: true },
          expires_at: Math.floor(input.expiresAt.getTime() / 1000),
          return_url: input.returnUrl,
        },
        // One session per hold, even when the start is retried.
        { idempotencyKey: `checkout/${input.checkoutId}` },
      );
      if (!session.client_secret) throw new Error("Stripe returned no client secret for the checkout session");
      return { reference: session.id, clientSecret: session.client_secret };
    },

    async resume(reference) {
      const session = await client.checkout.sessions.retrieve(reference);
      if (session.status !== "open" || !session.client_secret) throw new Error(`Can't resume a checkout session that is ${session.status}`);
      return { clientSecret: session.client_secret };
    },

    async verify(reference): Promise<PaymentCheck> {
      const { session, intent } = await read(reference);
      return {
        status: statusOf(session, intent),
        amount: intent?.amount ?? session.amount_total ?? 0,
        currency: (intent?.currency ?? session.currency ?? "usd").toUpperCase(),
        summary: summaryOf(intent),
        shipping: shippingOf(session),
      };
    },

    async settle(reference) {
      const { intent } = await read(reference);
      if (intent?.status === "succeeded") return;
      if (intent?.status !== "requires_capture") throw new Error(`Can't settle a payment that is ${intent?.status ?? "not started"}`);
      await client.paymentIntents.capture(intent.id, {}, { idempotencyKey: `settle/${reference}` });
    },

    async undo(reference) {
      let { session, intent } = await read(reference);
      if (session.status === "open") {
        try {
          await client.checkout.sessions.expire(reference);
          return;
        } catch {
          // It completed in the meantime: undo the payment it made instead.
          ({ session, intent } = await read(reference));
        }
      }
      if (intent?.status === "requires_capture") await client.paymentIntents.cancel(intent.id);
      else if (intent?.status === "succeeded") await client.refunds.create({ payment_intent: intent.id }, { idempotencyKey: `undo/${reference}` });
    },

    async parseWebhook(rawBody, headers): Promise<PaymentEvent | null> {
      const signature = headers.get("stripe-signature");
      if (!webhookSecret || !signature) throw new InvalidWebhookError();
      let event: Stripe.Event;
      try {
        // Verifies the signature over the raw body and refuses timestamps over 5 minutes old.
        event = await client.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
      } catch {
        throw new InvalidWebhookError();
      }
      const type = COMPLETED.has(event.type) ? "payment.completed" : EXPIRED.has(event.type) ? "payment.expired" : null;
      if (!type) return null;
      const session = event.data.object as Stripe.Checkout.Session;
      return { id: event.id, type, reference: session.id, checkoutId: session.client_reference_id ?? session.metadata?.checkout_id ?? null };
    },
  };
}

function statusOf(session: Stripe.Checkout.Session, intent: Stripe.PaymentIntent | null): PaymentStatus {
  if (session.status === "expired") return "expired";
  switch (intent?.status) {
    case "requires_capture":
      return "authorised";
    case "succeeded":
      return "paid";
    case "canceled":
      return "failed";
    default:
      // No payment yet, still paying (a declined card can be retried), or processing.
      return "pending";
  }
}

function summaryOf(intent: Stripe.PaymentIntent | null): string | null {
  const method = intent && typeof intent.payment_method === "object" ? intent.payment_method : null;
  if (!method) return null;
  if (method.type === "card" && method.card) {
    const brand = BRANDS[method.card.brand] ?? method.card.brand.charAt(0).toUpperCase() + method.card.brand.slice(1);
    return `${brand} ending ${method.card.last4}`;
  }
  return BRANDS[method.type] ?? null;
}

function shippingOf(session: Stripe.Checkout.Session): ShippingAddress | null {
  const details = session.collected_information?.shipping_details;
  if (!details) return null;
  const { address } = details;
  return {
    name: details.name,
    line1: address.line1 ?? "",
    line2: address.line2 ?? null,
    city: address.city ?? "",
    state: address.state ?? "",
    postalCode: address.postal_code ?? "",
    country: address.country ?? "",
  };
}
