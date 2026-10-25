import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// The root error boundary is a client component loaded with the root layout on every page. When it
// shared the storefront's components (Base UI's Button, the primitives) with the (store) layout,
// Turbopack shipped copies of them in two places: about 10 KB more JavaScript on every storefront
// page (found in M6's exit check). It stays on plain elements and React.
describe("src/app/error.tsx", () => {
  it("imports nothing but React", () => {
    const source = readFileSync(new URL("./error.tsx", import.meta.url), "utf8");
    const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((match) => match[1]);
    expect(imports).toEqual(["react"]);
  });
});
