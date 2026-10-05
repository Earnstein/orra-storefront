import { describe, expect, it } from "vitest";

import { RESERVED_COLLECTION_SLUGS, resolveCollection } from "./collections";

const categories = [
  { slug: "bags", name: "Bags" },
  { slug: "shoes", name: "Shoes" },
];

describe("resolveCollection", () => {
  it("resolves New arrivals to the newest 24 products, with tabs", () => {
    expect(resolveCollection("new", categories)).toMatchObject({
      slug: "new",
      title: "New arrivals",
      hasTabs: true,
      scope: { kind: "new", limit: 24 },
    });
  });

  it("resolves Women and Men to their audience, with tabs", () => {
    expect(resolveCollection("women", categories)).toMatchObject({
      title: "Women",
      hasTabs: true,
      scope: { kind: "audience", audience: "women" },
    });
    expect(resolveCollection("men", categories)).toMatchObject({
      title: "Men",
      hasTabs: true,
      scope: { kind: "audience", audience: "men" },
    });
  });

  it("resolves a category to itself, titled by its name, without tabs", () => {
    expect(resolveCollection("bags", categories)).toMatchObject({
      slug: "bags",
      title: "Bags",
      hasTabs: false,
      scope: { kind: "category", categorySlug: "bags" },
    });
  });

  it("returns undefined for unknown slugs, which are case-sensitive", () => {
    expect(resolveCollection("scarves", categories)).toBeUndefined();
    expect(resolveCollection("Women", categories)).toBeUndefined();
  });

  it("keeps new, women and men for the built-in collections", () => {
    expect([...RESERVED_COLLECTION_SLUGS]).toEqual(["new", "women", "men"]);
    const shadowing = [...categories, { slug: "women", name: "Womenswear" }];
    expect(resolveCollection("women", shadowing)).toMatchObject({ scope: { kind: "audience", audience: "women" } });
  });
});
