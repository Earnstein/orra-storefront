import { InvalidWebhookError, type PaymentCheck, type PaymentEvent, type PaymentProvider, type StartPaymentInput } from "./types";

type FakePayment = PaymentCheck & { input: StartPaymentInput; settled: number; undone: number; settleFails: boolean };

/**
 * An in-memory payment provider for tests (never used by the app). Each started payment is
 * `pending` until a test moves it on with `set`; `failSettle` makes the next settles throw.
 * Webhooks are JSON events "signed" with the header `x-fake-signature: valid`.
 */
export function createFakeProvider() {
  const payments = new Map<string, FakePayment>();
  let started = 0;

  function get(reference: string): FakePayment {
    const payment = payments.get(reference);
    if (!payment) throw new Error(`fake: no payment ${reference}`);
    return payment;
  }

  const provider: PaymentProvider = {
    name: "fake",
    async startPayment(input) {
      started += 1;
      const reference = `fake_${started}`;
      const amount = input.lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0);
      payments.set(reference, { status: "pending", amount, currency: input.currency, summary: null, shipping: null, input, settled: 0, undone: 0, settleFails: false });
      return { reference, clientSecret: `${reference}_secret` };
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
    /** The number of payments started so far. */
    get started() {
      return started;
    },
    set(reference: string, change: Partial<PaymentCheck>) {
      Object.assign(get(reference), change);
    },
    failSettle(reference: string, fails = true) {
      get(reference).settleFails = fails;
    },
  };
}

export type FakeProvider = ReturnType<typeof createFakeProvider>;
