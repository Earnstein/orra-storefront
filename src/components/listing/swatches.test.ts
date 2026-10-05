import { describe, expect, it } from "vitest";

import { colourFamily } from "@/db/schema/catalog";
import { SWATCHES } from "./swatches";

describe("SWATCHES", () => {
  it("has exactly one swatch per colour family", () => {
    expect(Object.keys(SWATCHES).toSorted()).toEqual([...colourFamily.enumValues].toSorted());
  });

  it("paints multicolour with a pattern and everything else with a plain colour", () => {
    expect(SWATCHES.multicolour).toMatch(/^conic-gradient\(/);
    for (const [family, value] of Object.entries(SWATCHES)) {
      if (family !== "multicolour") expect(value, family).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
