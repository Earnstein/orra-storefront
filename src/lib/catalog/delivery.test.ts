import { describe, expect, it } from "vitest";

import { DELIVERY_BUSINESS_DAYS, deliveryWindow } from "./delivery";

// October 2026, local time at noon so time zones can't shift the day.
const october = (day: number) => new Date(2026, 9, day, 12);
const ymd = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()];

describe("deliveryWindow", () => {
  it.each([
    ["Monday", 5, 7, 9],
    ["Friday", 9, 13, 15],
    ["Saturday", 10, 13, 15],
  ])("from %s %i Oct: earliest %i, latest %i (weekends skipped)", (_day, ordered, earliest, latest) => {
    const window = deliveryWindow(october(ordered));
    expect(ymd(window.earliest)).toEqual([2026, 10, earliest]);
    expect(ymd(window.latest)).toEqual([2026, 10, latest]);
  });

  it("does not change the order date", () => {
    const orderedAt = october(5);
    deliveryWindow(orderedAt);
    expect(ymd(orderedAt)).toEqual([2026, 10, 5]);
  });

  it("promises 2 to 4 business days", () => {
    expect(DELIVERY_BUSINESS_DAYS).toEqual({ min: 2, max: 4 });
  });
});
