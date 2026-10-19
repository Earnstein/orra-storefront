import { describe, expect, it } from "vitest";

import { TEST_SHIPPING } from "@/test/orders";
import { maskEmail, maskName, maskOrder, maskOrderRow } from "./mask";
import type { AdminOrder } from "./types";

describe("masking", () => {
  it("turns names into initials, first and last", () => {
    expect(maskName("Ada Lovelace")).toBe("A. L.");
    expect(maskName("  mary ann  smith ")).toBe("M. S.");
    expect(maskName("Ada")).toBe("A.");
    expect(maskName("Émile Zola")).toBe("É. Z.");
    expect(maskName("   ")).toBe("—");
  });

  it("keeps only an email's domain", () => {
    expect(maskEmail("ada@example.test")).toBe("•••@example.test");
    expect(maskEmail("not-an-email")).toBe("•••");
  });

  it("masks an order to initials, the email's domain, and the city and state only", () => {
    const order: AdminOrder = {
      id: "o1",
      number: "ORR-10001",
      status: "paid",
      createdAt: "2026-10-19T10:00:00.000Z",
      fulfilledAt: null,
      cancelledAt: null,
      refunded: false,
      cancelling: false,
      account: false,
      subtotal: 1000,
      currency: "USD",
      paymentSummary: "Visa ending 4242",
      items: [],
      masked: false,
      email: "ada@example.test",
      shipping: TEST_SHIPPING,
    };
    const masked = maskOrder(order);
    expect(masked).toMatchObject({ masked: true, email: "•••@example.test", shipping: { name: "A. L.", city: "Springfield", state: "IL" } });
    expect(Object.keys(masked.shipping!).sort()).toEqual(["city", "name", "state"]);
    expect(JSON.stringify(masked)).not.toMatch(/Lovelace|Main St|62701|ada@/);
    expect(maskOrder({ ...order, shipping: null }).shipping).toBeNull();
  });

  it("masks a table row", () => {
    const row = { number: "ORR-10001", createdAt: "", name: "Ada Lovelace", email: "ada@example.test", status: "paid" as const, total: 1, itemCount: 1 };
    expect(maskOrderRow(row)).toMatchObject({ name: "A. L.", email: "•••@example.test" });
    expect(maskOrderRow({ ...row, name: null }).name).toBeNull();
  });
});
