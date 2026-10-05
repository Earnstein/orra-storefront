import { describe, expect, it } from "vitest";

import { buildSearchQuery, MAX_QUERY_LENGTH } from "./search";

describe("buildSearchQuery", () => {
  it("joins words with AND and matches the last word as a prefix", () => {
    expect(buildSearchQuery("leather tote")).toEqual({ tsquery: "leather & tote:*", text: "leather tote" });
    expect(buildSearchQuery("  Lea ")?.tsquery).toBe("lea:*");
  });

  it("returns nothing when no words remain", () => {
    for (const q of ["", "   ", "&|!:*()", "';--"]) expect(buildSearchQuery(q), JSON.stringify(q)).toBeUndefined();
  });

  it("treats operators and SQL as plain words", () => {
    expect(buildSearchQuery("'; drop table products; --")?.tsquery).toBe("drop & table & products:*");
    expect(buildSearchQuery("gold | silver & !black")?.tsquery).toBe("gold & silver & black:*");
  });

  it("caps the text at 100 characters", () => {
    expect(MAX_QUERY_LENGTH).toBe(100);
    expect(buildSearchQuery("x".repeat(500))?.text).toHaveLength(100);
  });

  it("keeps letters from any script and drops symbols", () => {
    expect(buildSearchQuery("café 👜 bag")?.tsquery).toBe("café & bag:*");
  });
});
