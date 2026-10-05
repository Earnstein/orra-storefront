import { describe, expect, it } from "vitest";

import { completeRows } from "./complete-rows";

/** How many of `count` cards show at 2, 3 and 4 columns. */
function visibleCounts(count: number): [number, number, number] {
  const classes = Array.from({ length: count }, (_, index) => completeRows(index, count));
  const shown = (hidden: string) => classes.filter((value) => !value.split(" ").includes(hidden)).length;
  return [shown("max-md:hidden"), shown("md:max-xl:hidden"), shown("xl:hidden")];
}

describe("completeRows", () => {
  it("hides only the cards that would start an incomplete last row", () => {
    expect([1, 2, 3, 4, 8].map(visibleCounts)).toEqual([
      [1, 1, 1],
      [2, 2, 2],
      [2, 3, 3],
      [4, 3, 4],
      [8, 6, 8],
    ]);
  });
});
