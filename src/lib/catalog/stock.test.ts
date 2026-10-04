import { describe, expect, it } from "vitest";

import { LOW_STOCK_THRESHOLD, stockStatus } from "./stock";

describe("stockStatus", () => {
  it.each([
    [-1, "out_of_stock", "Sold out"],
    [0, "out_of_stock", "Sold out"],
    [1, "low_stock", "Only 1 left"],
    [3, "low_stock", "Only 3 left"],
    [4, "in_stock", "In stock"],
  ] as const)("%i units → %s (%s)", (units, state, label) => {
    expect(stockStatus(units)).toEqual({ state, label });
  });

  it("calls stock low at 3 units or fewer", () => {
    expect(LOW_STOCK_THRESHOLD).toBe(3);
  });
});
