import { describe, expect, it, vi } from "vitest";

import {
  getAllProductSlugs,
  getCategories,
  getNewArrivals,
  getProduct,
  getRelatedProducts,
  getSpotlightProduct,
} from "./queries";

// Real migrations and the real seed, in an in-memory Postgres.
vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

describe("catalogue queries", () => {
  it("lists every product slug", async () => {
    expect(await getAllProductSlugs()).toHaveLength(9);
  });

  it("returns the 8 newest products, newest first", async () => {
    expect((await getNewArrivals()).map((p) => p.slug)).toEqual([
      "top-handle-bag-teal",
      "double-monk-shoe",
      "round-sunglasses",
      "gold-hoop-earrings",
      "leather-biker-jacket",
      "bomber-jacket-rust",
      "floral-pump",
      "fringed-knit-poncho",
    ]);
  });

  it("honours a larger limit", async () => {
    const all = await getNewArrivals(24);
    expect(all).toHaveLength(9);
    expect(all.at(-1)?.slug).toBe("leather-tote-tan");
  });

  it("maps a product row to the storefront shape", async () => {
    const shoe = await getProduct("double-monk-shoe");
    expect(shoe).toMatchObject({
      name: "Double-monk shoe",
      category: { slug: "shoes", name: "Shoes" },
      price: 79000,
      colour: "Tan",
      stock: 2,
    });
    expect(shoe?.images).toHaveLength(2);
  });

  it("returns undefined for an unknown slug", async () => {
    expect(await getProduct("does-not-exist")).toBeUndefined();
  });

  it("returns the spotlight product", async () => {
    expect((await getSpotlightProduct()).slug).toBe("leather-tote-tan");
  });

  it("puts same-category products first in related products", async () => {
    const shoe = await getProduct("double-monk-shoe");
    expect((await getRelatedProducts(shoe!)).map((p) => p.slug)).toEqual([
      "floral-pump",
      "top-handle-bag-teal",
      "round-sunglasses",
      "gold-hoop-earrings",
    ]);
  });

  it("lists categories in creation order", async () => {
    expect((await getCategories()).map((c) => c.slug)).toEqual([
      "bags",
      "shoes",
      "accessories",
      "jewellery",
      "ready-to-wear",
    ]);
  });
});
