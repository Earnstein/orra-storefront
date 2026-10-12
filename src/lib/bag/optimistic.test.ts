import { describe, expect, it } from "vitest";

import { applyChange } from "./optimistic";
import type { Bag, BagLine } from "./types";

const line = (slug: string, quantity: number, overrides: Partial<BagLine> = {}): BagLine => ({
  slug,
  name: slug,
  colour: "Tan",
  unitPrice: 100,
  image: null,
  stock: 5,
  quantity,
  note: null,
  ...overrides,
});

const bag = (...lines: BagLine[]): Bag => {
  const buyable = lines.filter((l) => l.note !== "sold-out");
  return {
    lines,
    count: buyable.reduce((n, l) => n + l.quantity, 0),
    subtotal: buyable.reduce((n, l) => n + l.quantity * l.unitPrice, 0),
    currency: "USD",
  };
};

describe("applyChange", () => {
  it("sets a quantity within stock and the per-item cap, and recomputes the totals", () => {
    const next = applyChange(bag(line("a", 1), line("b", 2)), { kind: "set", slug: "a", quantity: 3 });
    expect(next.lines.map((l) => l.quantity)).toEqual([3, 2]);
    expect(next.count).toBe(5);
    expect(next.subtotal).toBe(500);
    expect(applyChange(bag(line("a", 1, { stock: 2 })), { kind: "set", slug: "a", quantity: 9 }).lines[0].quantity).toBe(2);
    expect(applyChange(bag(line("a", 1, { stock: 50 })), { kind: "set", slug: "a", quantity: 50 }).lines[0].quantity).toBe(10);
  });

  it("removes a line for remove and move", () => {
    for (const kind of ["remove", "move"] as const) {
      const next = applyChange(bag(line("a", 1), line("b", 2)), { kind, slug: "a" });
      expect(next.lines.map((l) => l.slug)).toEqual(["b"]);
      expect(next.count).toBe(2);
    }
  });

  it("leaves the bag as it is for an add (the server confirms adds) and for unknown slugs", () => {
    const current = bag(line("a", 1));
    expect(applyChange(current, { kind: "add", slug: "a", quantity: 1 })).toBe(current);
    expect(applyChange(current, { kind: "remove", slug: "zzz" }).lines).toEqual(current.lines);
  });

  it("keeps sold-out lines out of the totals", () => {
    const next = applyChange(bag(line("a", 1), line("b", 2, { stock: 0, note: "sold-out" })), { kind: "set", slug: "a", quantity: 2 });
    expect(next.count).toBe(2);
  });
});
