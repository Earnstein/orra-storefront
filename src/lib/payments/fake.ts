import { InvalidWebhookError, type PaymentCheck, type PaymentEvent, type PaymentProvider, type StartPaymentInput } from "./types";

type FakePayment = PaymentCheck & { input: StartPaymentInput; settled: number; undone: number; resumed: number; settleFails: boolean; undoFails: boolean };

/**
 * An in-memory payment provider for tests (never used by the app). Starting the same checkout
 * again returns the same payment, as Stripe's idempotency key does. Each started payment is
 * `pending` until a test moves it on with `set`; `failSettle` and `failUndo` make those calls throw.
 * Webhooks are JSON events "signed" with the header `x-fake-signature: valid`.
 */
export function createFakeProvider() {
  const payments = new Map<string, FakePayment>();
  const byCheckout = new Map<string, string>();
  let started = 0;

  function get(reference: string): FakePayment {
    const payment = payments.get(reference);
    if (!payment) throw new Error(`fake: no payment ${reference}`);
    return payment;
  }

  const provider: PaymentProvider = {
    name: "fake",
    async startPayment(input) {
      // Like Stripe's idempotency key: the same checkout gets the same payment back, and different
      // input for the same checkout is refused.
      const existing = byCheckout.get(input.checkoutId);
      if (existing) {
        if (JSON.stringify(get(existing).input) !== JSON.stringify(input)) throw new Error("fake: same checkout started with different input");
        return { reference: existing, clientSecret: `${existing}_secret` };
      }
      started += 1;
      const reference = `fake_${started}`;
      byCheckout.set(input.checkoutId, reference);
      const amount = input.lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0);
      payments.set(reference, { status: "pending", amount, currency: input.currency, summary: null, shipping: null, input, settled: 0, undone: 0, resumed: 0, settleFails: false, undoFails: false });
      return { reference, clientSecret: `${reference}_secret` };
    },
    async resume(reference) {
      const payment = get(reference);
      if (payment.status !== "pending") throw new Error(`fake: can't resume a payment that is ${payment.status}`);
      payment.resumed += 1;
      return { clientSecret: `${reference}_secret` };
    },
    async verify(reference) {
      const { status, amount, currency, summary, shipping } = get(reference);
      return { status, amount, currency, summary, shipping };
    },
    async settle(reference) {
      const payment = get(reference);
      if (payment.settleFails) throw new Error("fake: settle failed");
      if (payment.status === "paid") return;
      if (payment.status !== "authorised") throw new Error(`fake: can't settle a payment that is ${payment.status}`);
      payment.status = "paid";
      payment.settled += 1;
    },
    async undo(reference) {
      const payment = get(reference);
      if (payment.undoFails) throw new Error("fake: undo failed");
      // Like Stripe: a payment already cancelled, refunded or expired has nothing left to undo.
      if (payment.status === "failed" || payment.status === "expired") return;
      payment.undone += 1;
      payment.status = payment.status === "pending" ? "expired" : "failed";
    },
    async parseWebhook(rawBody, headers): Promise<PaymentEvent | null> {
      if (headers.get("x-fake-signature") !== "valid") throw new InvalidWebhookError();
      const event = JSON.parse(rawBody) as PaymentEvent;
      return event.type === "payment.completed" || event.type === "payment.expired" ? event : null;
    },
  };

  return {
    provider,
    payments,
    /** The number of distinct payments started so far. */
    get started() {
      return started;
    },
    set(reference: string, change: Partial<PaymentCheck>) {
      Object.assign(get(reference), change);
    },
    failSettle(reference: string, fails = true) {
      get(reference).settleFails = fails;
    },
    failUndo(reference: string, fails = true) {
      get(reference).undoFails = fails;
    },
  };
}

export type FakeProvider = ReturnType<typeof createFakeProvider>;
