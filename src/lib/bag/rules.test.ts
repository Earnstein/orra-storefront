import { describe, expect, it } from "vitest";

import { SAVED_LIMIT } from "@/lib/saved/limits";
import { addSaved, EMPTY_BAG, isSaved, parseBagState, removeSaved, toggleSaved, withoutLines } from "./rules";

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

describe("toggleSaved cap", () => {
  it("keeps at most SAVED_LIMIT saved slugs in the browser, dropping the oldest", () => {
    const full = { lines: [], saved: Array.from({ length: SAVED_LIMIT }, (_, i) => `p-${i}`) };
    const next = toggleSaved(full, "new-one");
    expect(next.saved).toHaveLength(SAVED_LIMIT);
    expect(next.saved[0]).toBe("p-1");
    expect(next.saved.at(-1)).toBe("new-one");
  });
});

describe("addSaved", () => {
  it("saves once and never unsaves", () => {
    const saved = addSaved(EMPTY_BAG, "a");
    expect(saved.saved).toEqual(["a"]);
    expect(addSaved(saved, "a")).toBe(saved);
  });
});

describe("withoutLines", () => {
  it("drops old bag lines and keeps saved items", () => {
    const state = { lines: [{ slug: "a", quantity: 2 }], saved: ["b"] };
    expect(withoutLines(state)).toEqual({ lines: [], saved: ["b"] });
    expect(withoutLines(EMPTY_BAG)).toBe(EMPTY_BAG);
  });
});
