import { describe, expect, it } from "vitest";

import { categories, products } from "./catalog";

// The products that existed before M2, in their original order. They stay first so the
// homepage's "New this season" (newest 8) and links shared before M2 don't change.
const TODAYS_NINE = [
  "top-handle-bag-teal",
  "double-monk-shoe",
  "round-sunglasses",
  "gold-hoop-earrings",
  "leather-biker-jacket",
  "bomber-jacket-rust",
  "floral-pump",
  "fringed-knit-poncho",
  "leather-tote-tan",
];

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

describe("seed catalogue", () => {
  it("has 48 products across the five categories, with today's 9 first", () => {
    expect(products).toHaveLength(48);
    expect(countBy(products, (p) => p.category)).toEqual({
      bags: 10,
      shoes: 10,
      accessories: 10,
      jewellery: 8,
      "ready-to-wear": 10,
    });
    expect(products.slice(0, 9).map((p) => p.slug)).toEqual(TODAYS_NINE);
    expect(new Set(products.map((p) => p.slug)).size).toBe(48);
  });

  it("gives Women and Men a full collection each", () => {
    expect(countBy(products, (p) => p.audience)).toEqual({ women: 24, men: 16, unisex: 8 });
    for (const audience of ["women", "men"]) {
      const visible = products.filter((p) => p.audience === audience || p.audience === "unisex");
      expect(new Set(visible.map((p) => p.category)).size).toBeGreaterThanOrEqual(4);
    }
  });

  it("covers every stock state and a realistic price range", () => {
    expect(products.every((p) => p.price >= 25_000 && p.price <= 350_000)).toBe(true);
    expect(products.filter((p) => p.stock === 0)).toHaveLength(3);
    expect(products.filter((p) => p.stock >= 1 && p.stock <= 3)).toHaveLength(5);
  });

  it("spreads colour families and materials enough to filter on", () => {
    expect(new Set(products.map((p) => p.colourFamily)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(products.map((p) => p.material)).size).toBeGreaterThanOrEqual(8);
    for (const category of categories) {
      const families = products.filter((p) => p.category === category.slug).map((p) => p.colourFamily);
      expect(new Set(families).size, category.slug).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses each photo once, from Unsplash's free CDN, with alt text", () => {
    expect(new Set(products.map((p) => new URL(p.images[0].src).pathname)).size).toBe(48);
    for (const image of products.flatMap((p) => p.images)) {
      expect(image.src).toMatch(
        /^https:\/\/images\.unsplash\.com\/photo-[\w-]+(\?ar=4:5&fit=crop&crop=focalpoint&fp-x=[\d.]+&fp-y=[\d.]+&fp-z=[\d.]+)?$/,
      );
      expect(image.alt.trim()).not.toBe("");
    }
  });
});
