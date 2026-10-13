/**
 * The payment-provider interface. The rest of the app imports only this, so Paystack (v1.1.0) can
 * implement the same five calls: start a payment, check it, take the money, give it back, and
 * read a webhook.
 */

/** One line of a hold, priced from the database (cents). */
export type PaymentLine = { name: string; unitPrice: number; quantity: number; image: string | null };

export type StartPaymentInput = {
  checkoutId: string;
  email: string;
  lines: PaymentLine[];
  currency: "USD";
  /** The hold's expiry; the payment can't complete after it. */
  expiresAt: Date;
  /** Where a redirect-based payment method (or 3-D Secure) brings the shopper back. */
  returnUrl: string;
};

export type ShippingAddress = {
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

/**
 * - `authorised`: the money is reserved, not yet taken (`settle` takes it);
 * - `paid`: taken;
 * - `pending`: not finished (still paying, or processing);
 * - `failed`: the payment was cancelled or can't complete;
 * - `expired`: the payment's time ran out.
 */
export type PaymentStatus = "authorised" | "paid" | "pending" | "failed" | "expired";

export type PaymentCheck = {
  status: PaymentStatus;
  /** Cents: what was authorised or paid (the order total until then). */
  amount: number;
  currency: string;
  /** How the shopper paid, e.g. "Visa ending 4242", or null when unknown. */
  summary: string | null;
  shipping: ShippingAddress | null;
};

export type PaymentEvent = {
  /** The provider's event id, so a repeated delivery can be skipped. */
  id: string;
  type: "payment.completed" | "payment.expired";
  reference: string;
  checkoutId: string | null;
};

export interface PaymentProvider {
  name: "stripe" | "fake";
  startPayment(input: StartPaymentInput): Promise<{ reference: string; clientSecret: string }>;
  verify(reference: string): Promise<PaymentCheck>;
  /** Takes authorised money. Safe to repeat: does nothing once paid. */
  settle(reference: string): Promise<void>;
  /** Cancels an authorisation, closes an unfinished payment, or refunds money already taken. */
  undo(reference: string): Promise<void>;
  /** A verified event, or null for events we don't use. Throws InvalidWebhookError when unverified. */
  parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent | null>;
}

/** The webhook's signature is missing, wrong or stale: answer 400. */
export class InvalidWebhookError extends Error {
  constructor(message = "invalid webhook signature") {
    super(message);
    this.name = "InvalidWebhookError";
  }
}

/** Payments aren't configured (no Stripe keys): checkout says it's unavailable. */
export class PaymentsUnavailableError extends Error {
  constructor() {
    super("payments not configured");
    this.name = "PaymentsUnavailableError";
  }
}
