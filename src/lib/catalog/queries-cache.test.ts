import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// In Vitest, "use cache" is an inert string and next/cache is a no-op stand-in, so a read that
// lost its cache lines would still pass every query test. This pins them in the source instead.
const source = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");
const reads = [...source.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\n([^\n]*)\n([^\n]*)\n([^\n]*)\n/g)];

describe("catalogue reads", () => {
  it("are all exported as async functions", () => {
    expect(reads.length).toBe([...source.matchAll(/^export /gm)].length);
  });

  it.each(reads.map((match) => [match[1], match.slice(2, 5).map((line) => line.trim())] as const))(
    "%s is cached under the catalog tag and lifetime",
    (_name, firstLines) => {
      expect(firstLines).toEqual(['"use cache";', 'cacheTag("catalog");', 'cacheLife("catalog");']);
    },
  );
});
