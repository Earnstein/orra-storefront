import { describe, expect, it } from "vitest";

import { parseBagCount } from "./bag-count";

describe("parseBagCount", () => {
  it("reads the count cookie among others", () => {
    expect(parseBagCount("a=1; orra_bag_count=3; b=2")).toBe(3);
    expect(parseBagCount("orra_bag_count=0")).toBe(0);
  });

  it("treats a missing, negative, non-numeric or absurd value as 0", () => {
    for (const cookie of ["", "other=4", "orra_bag_count=-1", "orra_bag_count=abc", "orra_bag_count=1e9", "orra_bag_count=1000", "orra_bag_count=2.5", "xorra_bag_count=5"]) {
      expect(parseBagCount(cookie)).toBe(0);
    }
  });

  it("accepts the largest count the server writes", () => {
    expect(parseBagCount("orra_bag_count=999")).toBe(999);
  });
});
