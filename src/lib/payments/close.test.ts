import { describe, expect, it, vi } from "vitest";

import { closeReleasedPayment } from "./close";
import { createFakeProvider } from "./fake";

const input = {
  checkoutId: "c1",
  email: "a@example.test",
  currency: "USD" as const,
  expiresAt: new Date(),
  returnUrl: "https://orra.test/checkout/success",
  lines: [{ name: "Tote", unitPrice: 1000, quantity: 1 }],
};

async function started() {
  const fake = createFakeProvider();
  const { reference } = await fake.provider.startPayment(input);
  return { fake, reference };
}

describe("closeReleasedPayment", () => {
  it("closes a payment nobody has made yet", async () => {
    const { fake, reference } = await started();
    expect(await closeReleasedPayment(fake.provider, reference)).toBe("closed");
    expect(fake.payments.get(reference)?.undone).toBe(1);
  });

  it.each(["authorised", "paid"] as const)("leaves a payment that is %s for fulfilment", async (status) => {
    const { fake, reference } = await started();
    fake.set(reference, { status });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await closeReleasedPayment(fake.provider, reference)).toBe("left");
    expect(fake.payments.get(reference)?.undone).toBe(0);
  });

  it("has nothing to do for an expired or failed payment", async () => {
    const { fake, reference } = await started();
    fake.set(reference, { status: "expired" });
    expect(await closeReleasedPayment(fake.provider, reference)).toBe("closed");
    expect(fake.payments.get(reference)?.undone).toBe(0);
  });

  it("leaves a payment it can't check, and never throws", async () => {
    const { fake, reference } = await started();
    const provider = { ...fake.provider, verify: async () => Promise.reject(new Error("stripe is down")) };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await closeReleasedPayment(provider, reference)).toBe("left");
    expect(fake.payments.get(reference)?.undone).toBe(0);
  });
});
