import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStripeProvider } from "./stripe";
import { InvalidWebhookError } from "./types";

// The Stripe client is real (so request shapes are type-checked against the SDK) with its network
// calls stubbed; webhook signatures use Stripe's own offline signer. No key here is a real one.
const WEBHOOK_SECRET = "whsec_unit_test";
const CHECKOUT_ID = "6f0c2a54-1d1e-4d8b-9a55-3a8f9d1c2b7e";

let client: Stripe;
let provider: ReturnType<typeof createStripeProvider>;

beforeEach(() => {
  client = new Stripe("sk_test_unit");
  provider = createStripeProvider({ client, webhookSecret: WEBHOOK_SECRET });
});

const session = (fields: Record<string, unknown> = {}) =>
  ({
    id: "cs_test_1",
    object: "checkout.session",
    client_secret: "cs_test_1_secret_abc",
    status: "open",
    amount_total: 196000,
    currency: "usd",
    client_reference_id: CHECKOUT_ID,
    metadata: { checkout_id: CHECKOUT_ID },
    collected_information: null,
    payment_intent: null,
    ...fields,
  }) as unknown as Stripe.Response<Stripe.Checkout.Session>;

const intent = (status: string, fields: Record<string, unknown> = {}) => ({
  id: "pi_1",
  object: "payment_intent",
  status,
  amount: 196000,
  currency: "usd",
  payment_method: { id: "pm_1", type: "card", card: { brand: "visa", last4: "4242" } },
  ...fields,
});

describe("startPayment", () => {
  it("creates an elements Checkout Session that authorises only, priced from the hold, expiring with it", async () => {
    const create = vi.spyOn(client.checkout.sessions, "create").mockResolvedValue(session());
    const expiresAt = new Date("2026-10-13T15:45:30.500Z");
    const result = await provider.startPayment({
      checkoutId: CHECKOUT_ID,
      email: "shopper@example.test",
      currency: "USD",
      expiresAt,
      returnUrl: `https://orra.test/checkout/success?checkout=${CHECKOUT_ID}`,
      lines: [
        { name: "Leather tote", unitPrice: 98000, quantity: 2 },
        { name: "Silk scarf", unitPrice: 0, quantity: 1 },
      ],
    });

    expect(result).toEqual({ reference: "cs_test_1", clientSecret: "cs_test_1_secret_abc" });
    expect(create).toHaveBeenCalledTimes(1);
    const [params, options] = create.mock.calls[0]!;
    expect(params).toMatchObject({
      ui_mode: "elements",
      mode: "payment",
      customer_email: "shopper@example.test",
      client_reference_id: CHECKOUT_ID,
      metadata: { checkout_id: CHECKOUT_ID },
      payment_intent_data: { capture_method: "manual", metadata: { checkout_id: CHECKOUT_ID } },
      shipping_address_collection: { allowed_countries: ["US"] },
      phone_number_collection: { enabled: true },
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      return_url: `https://orra.test/checkout/success?checkout=${CHECKOUT_ID}`,
    });
    // Only cards and Link: bank debits and buy-now-pay-later are left out.
    expect(params?.excluded_payment_method_types).toEqual(expect.arrayContaining(["us_bank_account", "cashapp", "klarna", "affirm"]));
    expect(params?.excluded_payment_method_types).not.toContain("card");
    expect(params?.line_items).toEqual([
      { quantity: 2, price_data: { currency: "usd", unit_amount: 98000, product_data: { name: "Leather tote" } } },
      { quantity: 1, price_data: { currency: "usd", unit_amount: 0, product_data: { name: "Silk scarf" } } },
    ]);
    // A retried start for the same hold can't create a second session.
    expect(options).toMatchObject({ idempotencyKey: `checkout/${CHECKOUT_ID}` });
  });

  it("fails when Stripe returns no client secret", async () => {
    vi.spyOn(client.checkout.sessions, "create").mockResolvedValue(session({ client_secret: null }));
    await expect(
      provider.startPayment({ checkoutId: CHECKOUT_ID, email: "a@example.test", currency: "USD", expiresAt: new Date(), returnUrl: "https://orra.test/x", lines: [] }),
    ).rejects.toThrow(/client secret/);
  });
});

describe("resume", () => {
  it("returns an open session's client secret, and refuses one that's finished", async () => {
    const retrieve = vi.spyOn(client.checkout.sessions, "retrieve").mockResolvedValueOnce(session());
    expect(await provider.resume("cs_test_1")).toEqual({ clientSecret: "cs_test_1_secret_abc" });
    expect(retrieve).toHaveBeenCalledWith("cs_test_1");
    retrieve.mockResolvedValueOnce(session({ status: "expired" }));
    await expect(provider.resume("cs_test_1")).rejects.toThrow(/expired/);
  });
});

describe("verify", () => {
  it("reads an authorised payment, how it was paid and where it goes", async () => {
    const retrieve = vi.spyOn(client.checkout.sessions, "retrieve").mockResolvedValue(
      session({
        status: "complete",
        payment_intent: intent("requires_capture"),
        collected_information: {
          shipping_details: {
            name: "Ada Lovelace",
            address: { line1: "1 Main St", line2: null, city: "Brooklyn", state: "NY", postal_code: "11201", country: "US" },
          },
        },
      }),
    );
    expect(await provider.verify("cs_test_1")).toEqual({
      status: "authorised",
      amount: 196000,
      currency: "USD",
      summary: "Visa ending 4242",
      shipping: { name: "Ada Lovelace", line1: "1 Main St", line2: null, city: "Brooklyn", state: "NY", postalCode: "11201", country: "US" },
    });
    expect(retrieve).toHaveBeenCalledWith("cs_test_1", { expand: ["payment_intent.payment_method", "payment_intent.latest_charge"] });
  });

  it.each([
    ["succeeded", "complete", "paid"],
    ["processing", "complete", "pending"],
    ["requires_payment_method", "open", "pending"],
    ["canceled", "complete", "failed"],
  ])("maps a PaymentIntent that is %s to %s", async (piStatus, sessionStatus, expected) => {
    vi.spyOn(client.checkout.sessions, "retrieve").mockResolvedValue(session({ status: sessionStatus, payment_intent: intent(piStatus) }));
    expect((await provider.verify("cs_test_1")).status).toBe(expected);
  });

  it("maps an expired session to expired, and an open one with no payment yet to pending", async () => {
    const retrieve = vi.spyOn(client.checkout.sessions, "retrieve");
    retrieve.mockResolvedValueOnce(session({ status: "expired" }));
    expect((await provider.verify("cs_test_1")).status).toBe("expired");
    retrieve.mockResolvedValueOnce(session());
    expect(await provider.verify("cs_test_1")).toMatchObject({ status: "pending", amount: 196000, summary: null, shipping: null });
  });

  it("reads a payment refunded in full as failed (Stripe keeps it succeeded), and a partly refunded one as paid", async () => {
    const retrieve = vi.spyOn(client.checkout.sessions, "retrieve");
    retrieve.mockResolvedValueOnce(session({ status: "complete", payment_intent: intent("succeeded", { latest_charge: { id: "ch_1", refunded: true } }) }));
    expect((await provider.verify("cs_test_1")).status).toBe("failed");
    retrieve.mockResolvedValueOnce(session({ status: "complete", payment_intent: intent("succeeded", { latest_charge: { id: "ch_1", refunded: false } }) }));
    expect((await provider.verify("cs_test_1")).status).toBe("paid");
  });

  it("names other card brands and Link", async () => {
    const retrieve = vi.spyOn(client.checkout.sessions, "retrieve");
    retrieve.mockResolvedValueOnce(
      session({ payment_intent: intent("requires_capture", { payment_method: { type: "card", card: { brand: "amex", last4: "0005" } } }) }),
    );
    expect((await provider.verify("cs_test_1")).summary).toBe("American Express ending 0005");
    retrieve.mockResolvedValueOnce(session({ payment_intent: intent("requires_capture", { payment_method: { type: "link" } }) }));
    expect((await provider.verify("cs_test_1")).summary).toBe("Link");
  });
});

describe("settle", () => {
  it("captures an authorised payment once", async () => {
    vi.spyOn(client.checkout.sessions, "retrieve").mockResolvedValue(session({ status: "complete", payment_intent: intent("requires_capture") }));
    const capture = vi.spyOn(client.paymentIntents, "capture").mockResolvedValue({} as Stripe.Response<Stripe.PaymentIntent>);
    await provider.settle("cs_test_1");
    expect(capture).toHaveBeenCalledWith("pi_1", {}, { idempotencyKey: "settle/cs_test_1" });
  });

  it("does nothing when the payment is already taken", async () => {
    vi.spyOn(client.checkout.sessions, "retrieve").mockResolvedValue(session({ status: "complete", payment_intent: intent("succeeded") }));
    const capture = vi.spyOn(client.paymentIntents, "capture");
    await provider.settle("cs_test_1");
    expect(capture).not.toHaveBeenCalled();
  });

  it("refuses a payment that isn't authorised", async () => {
    vi.spyOn(client.checkout.sessions, "retrieve").mockResolvedValue(session({ status: "complete", payment_intent: intent("canceled") }));
    await expect(provider.settle("cs_test_1")).rejects.toThrow(/canceled/);
  });
});

describe("undo", () => {
  it("cancels an authorisation", async () => {
    vi.spyOn(client.checkout.sessions, "retrieve").mockResolvedValue(session({ status: "complete", payment_intent: intent("requires_capture") }));
    const cancel = vi.spyOn(client.paymentIntents, "cancel").mockResolvedValue({} as Stripe.Response<Stripe.PaymentIntent>);
    const expire = vi.spyOn(client.checkout.sessions, "expire");
    await provider.undo("cs_test_1");
    expect(cancel).toHaveBeenCalledWith("pi_1");
    expect(expire).not.toHaveBeenCalled();
  });

  it("expires an open session so it can't be paid", async () => {
    vi.spyOn(client.checkout.sessions, "retrieve").mockResolvedValue(session());
    const expire = vi.spyOn(client.checkout.sessions, "expire").mockResolvedValue(session({ status: "expired" }));
    await provider.undo("cs_test_1");
    expect(expire).toHaveBeenCalledWith("cs_test_1");
  });

  it("re-reads a session that completed while it was being expired, and cancels its authorisation", async () => {
    const retrieve = vi.spyOn(client.checkout.sessions, "retrieve");
    retrieve.mockResolvedValueOnce(session()).mockResolvedValueOnce(session({ status: "complete", payment_intent: intent("requires_capture") }));
    vi.spyOn(client.checkout.sessions, "expire").mockRejectedValue(new Error("This Checkout Session is not open"));
    const cancel = vi.spyOn(client.paymentIntents, "cancel").mockResolvedValue({} as Stripe.Response<Stripe.PaymentIntent>);
    await provider.undo("cs_test_1");
    expect(cancel).toHaveBeenCalledWith("pi_1");
  });

  it("refunds money already taken, once", async () => {
    vi.spyOn(client.checkout.sessions, "retrieve").mockResolvedValue(session({ status: "complete", payment_intent: intent("succeeded") }));
    const refund = vi.spyOn(client.refunds, "create").mockResolvedValue({} as Stripe.Response<Stripe.Refund>);
    await provider.undo("cs_test_1");
    expect(refund).toHaveBeenCalledWith({ payment_intent: "pi_1" }, { idempotencyKey: "undo/cs_test_1" });
  });

  it("doesn't refund a payment already refunded in full", async () => {
    vi.spyOn(client.checkout.sessions, "retrieve").mockResolvedValue(
      session({ status: "complete", payment_intent: intent("succeeded", { latest_charge: { id: "ch_1", refunded: true } }) }),
    );
    const refund = vi.spyOn(client.refunds, "create");
    await provider.undo("cs_test_1");
    expect(refund).not.toHaveBeenCalled();
  });

  it("does nothing for an expired session or a cancelled payment", async () => {
    const retrieve = vi.spyOn(client.checkout.sessions, "retrieve");
    retrieve.mockResolvedValueOnce(session({ status: "expired" })).mockResolvedValueOnce(session({ status: "complete", payment_intent: intent("canceled") }));
    const expire = vi.spyOn(client.checkout.sessions, "expire");
    const cancel = vi.spyOn(client.paymentIntents, "cancel");
    const refund = vi.spyOn(client.refunds, "create");
    await provider.undo("cs_test_1");
    await provider.undo("cs_test_1");
    expect([expire, cancel, refund].map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0]);
  });
});

describe("parseWebhook", () => {
  const event = (type: string, object: Record<string, unknown> = {}) =>
    JSON.stringify({ id: "evt_1", object: "event", type, data: { object: { ...session(), ...object } } });
  const signed = (payload: string, options: { secret?: string; timestamp?: number } = {}) =>
    new Headers({
      "stripe-signature": client.webhooks.generateTestHeaderString({
        payload,
        secret: options.secret ?? WEBHOOK_SECRET,
        timestamp: options.timestamp,
      }),
    });

  it.each([
    ["checkout.session.completed", "payment.completed"],
    ["checkout.session.async_payment_succeeded", "payment.completed"],
    ["checkout.session.expired", "payment.expired"],
  ])("maps %s to %s", async (stripeType, type) => {
    const payload = event(stripeType);
    expect(await provider.parseWebhook(payload, signed(payload))).toEqual({ id: "evt_1", type, reference: "cs_test_1", checkoutId: CHECKOUT_ID });
  });

  it("falls back to the metadata for the checkout id, and returns null for events it doesn't use", async () => {
    const payload = event("checkout.session.completed", { client_reference_id: null });
    expect((await provider.parseWebhook(payload, signed(payload)))?.checkoutId).toBe(CHECKOUT_ID);
    const other = event("payment_intent.created");
    expect(await provider.parseWebhook(other, signed(other))).toBeNull();
  });

  it("rejects a tampered body, a wrong secret, a stale timestamp and a missing signature", async () => {
    const payload = event("checkout.session.completed");
    const tampered = payload.replace("196000", "1");
    await expect(provider.parseWebhook(tampered, signed(payload))).rejects.toBeInstanceOf(InvalidWebhookError);
    await expect(provider.parseWebhook(payload, signed(payload, { secret: "whsec_other" }))).rejects.toBeInstanceOf(InvalidWebhookError);
    const stale = Math.floor(Date.now() / 1000) - 10 * 60;
    await expect(provider.parseWebhook(payload, signed(payload, { timestamp: stale }))).rejects.toBeInstanceOf(InvalidWebhookError);
    await expect(provider.parseWebhook(payload, new Headers())).rejects.toBeInstanceOf(InvalidWebhookError);
  });

  it("rejects every webhook when no signing secret is configured", async () => {
    const unsigned = createStripeProvider({ client, webhookSecret: undefined });
    const payload = event("checkout.session.completed");
    await expect(unsigned.parseWebhook(payload, signed(payload))).rejects.toBeInstanceOf(InvalidWebhookError);
  });
});
