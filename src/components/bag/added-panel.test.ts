import { describe, expect, it } from "vitest";

import { cappedMessage } from "./added-panel";
import type { BagLine } from "@/lib/bag/types";

const line = (quantity: number, stock: number): BagLine => ({ slug: "a", name: "A", colour: "Tan", unitPrice: 100, image: null, stock, quantity, note: null });

describe("cappedMessage", () => {
  it("says nothing while there's more to add", () => {
    expect(cappedMessage({ line: line(1, 5), capped: false, pageStock: 5 })).toBeNull();
  });

  it("says when the bag now holds all the stock, capped or not", () => {
    expect(cappedMessage({ line: line(2, 2), capped: false, pageStock: 2 })).toBe("You have all 2 available in your bag");
    expect(cappedMessage({ line: line(2, 2), capped: true, pageStock: 2 })).toBe("You have all 2 available in your bag");
    expect(cappedMessage({ line: line(1, 1), capped: false, pageStock: 1 })).toBe("It's the last one, and it's in your bag");
  });

  it("explains live stock lower than the page showed", () => {
    expect(cappedMessage({ line: line(1, 1), capped: true, pageStock: 4 })).toBe("Only 1 was left — it's in your bag");
    expect(cappedMessage({ line: line(2, 2), capped: true, pageStock: 4 })).toBe("Only 2 were left — they're in your bag");
  });

  it("names the per-item limit", () => {
    expect(cappedMessage({ line: line(10, 50), capped: true, pageStock: 50 })).toBe("That's the most of one item per order");
  });
});
