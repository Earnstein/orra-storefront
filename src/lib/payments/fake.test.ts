import { describe, expect, it } from "vitest";

import { createFakeProvider } from "./fake";
import { InvalidWebhookError } from "./types";

const input = {
  checkoutId: "c1",
  email: "a@example.test",
  currency: "USD" as const,
  expiresAt: new Date(),
  returnUrl: "https://orra.test/checkout/success",
  lines: [{ name: "Tote", unitPrice: 1000, quantity: 2, image: null }],
};

describe("the fake payment provider", () => {
  it("starts pending at the lines' total, settles once authorised, and settles only once", async () => {
    const fake = createFakeProvider();
    const { reference } = await fake.provider.startPayment(input);
    expect(await fake.provider.verify(reference)).toMatchObject({ status: "pending", amount: 2000 });
    await expect(fake.provider.settle(reference)).rejects.toThrow(/pending/);
    fake.set(reference, { status: "authorised" });
    await fake.provider.settle(reference);
    await fake.provider.settle(reference);
    expect(fake.payments.get(reference)).toMatchObject({ status: "paid", settled: 1 });
  });

  it("fails settles on request, and undo expires a pending payment or cancels an authorised one", async () => {
    const fake = createFakeProvider();
    const a = (await fake.provider.startPayment(input)).reference;
    const b = (await fake.provider.startPayment(input)).reference;
    fake.set(b, { status: "authorised" });
    fake.failSettle(b);
    await expect(fake.provider.settle(b)).rejects.toThrow(/settle failed/);
    await fake.provider.undo(a);
    await fake.provider.undo(b);
    expect([(await fake.provider.verify(a)).status, (await fake.provider.verify(b)).status]).toEqual(["expired", "failed"]);
  });

  it("accepts only webhooks with its signature header", async () => {
    const fake = createFakeProvider();
    const body = JSON.stringify({ id: "e1", type: "payment.completed", reference: "fake_1", checkoutId: "c1" });
    expect(await fake.provider.parseWebhook(body, new Headers({ "x-fake-signature": "valid" }))).toMatchObject({ id: "e1" });
    await expect(fake.provider.parseWebhook(body, new Headers())).rejects.toBeInstanceOf(InvalidWebhookError);
  });
});
