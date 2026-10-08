import { describe, expect, it } from "vitest";

import { addToBag, bagCount, EMPTY_BAG, isSaved, parseBagState, quantityInBag, removeSaved, toggleSaved } from "./rules";

describe("addToBag", () => {
  it("adds one unit of a new product", () => {
    expect(addToBag(EMPTY_BAG, "a", 5)).toEqual({ state: { lines: [{ slug: "a", quantity: 1 }], saved: [] }, added: true });
  });

  it("increments an existing line", () => {
    const state = { lines: [{ slug: "a", quantity: 1 }], saved: [] };
    expect(addToBag(state, "a", 5).state.lines).toEqual([{ slug: "a", quantity: 2 }]);
  });

  it("never exceeds stock", () => {
    const full = { lines: [{ slug: "a", quantity: 2 }], saved: [] };
    expect(addToBag(full, "a", 2)).toEqual({ state: full, added: false });
  });

  it("adds nothing when the product is sold out", () => {
    expect(addToBag(EMPTY_BAG, "a", 0).added).toBe(false);
  });
});

describe("bag counts", () => {
  it("sums quantities across lines", () => {
    expect(bagCount({ lines: [{ slug: "a", quantity: 2 }, { slug: "b", quantity: 3 }], saved: [] })).toBe(5);
  });

  it("has zero of a product that isn't in the bag", () => {
    expect(quantityInBag(EMPTY_BAG, "missing")).toBe(0);
  });
});

describe("saved items", () => {
  it("saves, then unsaves", () => {
    expect(isSaved(toggleSaved(EMPTY_BAG, "a"), "a")).toBe(true);
    expect(toggleSaved(toggleSaved(EMPTY_BAG, "a"), "a")).toEqual(EMPTY_BAG);
  });
});

describe("parseBagState", () => {
  it.each([null, "x", 42, undefined])("returns an empty bag for %p", (junk) => {
    expect(parseBagState(junk)).toEqual(EMPTY_BAG);
  });

  it("keeps only well-formed lines and saved slugs", () => {
    expect(
      parseBagState({
        lines: [{ slug: "a", quantity: 1 }, { slug: "b", quantity: 0 }, { slug: "c", quantity: 1.5 }, { quantity: 2 }, null],
        saved: ["a", 1, null],
      }),
    ).toEqual({ lines: [{ slug: "a", quantity: 1 }], saved: ["a"] });
  });

  it("ignores lines and saved values that aren't arrays", () => {
    expect(parseBagState({ lines: "nope", saved: {} })).toEqual(EMPTY_BAG);
  });
});

describe("removeSaved", () => {
  it("removes the given saved slugs and keeps the rest, and the bag lines", () => {
    const state = { lines: [{ slug: "tote", quantity: 2 }], saved: ["a", "b", "c"] };
    expect(removeSaved(state, ["a", "c", "nope"])).toEqual({ lines: [{ slug: "tote", quantity: 2 }], saved: ["b"] });
  });

  it("returns the same state when nothing is removed", () => {
    const state = { lines: [], saved: ["a"] };
    expect(removeSaved(state, [])).toBe(state);
  });
});
