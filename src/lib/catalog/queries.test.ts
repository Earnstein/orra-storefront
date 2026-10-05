import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { categories } from "@/db/schema";
import { products as seedProducts, type SeedProduct } from "@/db/seed/catalog";
import {
  getAllProductSlugs,
  getCategories,
  getCollectionProducts,
  getNewArrivals,
  getProduct,
  getRelatedProducts,
  getSpotlightProduct,
} from "./queries";
import type { Product } from "./types";

// Real migrations and the real seed, in an in-memory Postgres.
vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

const slugs = (products: Product[]) => products.map((product) => product.slug);
/** Seed slugs in seed order, which is newest first. */
const seedSlugs = (keep: (product: SeedProduct) => boolean) => seedProducts.filter(keep).map((product) => product.slug);

describe("getCollectionProducts", () => {
  it("lists an audience together with unisex products, newest first", async () => {
    expect(slugs(await getCollectionProducts({ kind: "audience", audience: "women" }))).toEqual(
      seedSlugs((product) => product.audience !== "men"),
    );
    expect(slugs(await getCollectionProducts({ kind: "audience", audience: "men" }))).toEqual(
      seedSlugs((product) => product.audience !== "women"),
    );
  });

  it("lists one category, newest first", async () => {
    expect(slugs(await getCollectionProducts({ kind: "category", categorySlug: "bags" }))).toEqual(
      seedSlugs((product) => product.category === "bags"),
    );
  });

  it("limits New to the newest N", async () => {
    expect(slugs(await getCollectionProducts({ kind: "new", limit: 3 }))).toEqual(seedSlugs(() => true).slice(0, 3));
  });

  it("returns nothing for a category that has no products", async () => {
    await db.insert(categories).values({ slug: "scarves", name: "Scarves" });
    try {
      expect(await getCollectionProducts({ kind: "category", categorySlug: "scarves" })).toEqual([]);
    } finally {
      await db.delete(categories).where(eq(categories.slug, "scarves"));
    }
  });
});

describe("catalogue queries", () => {
  it("lists every product slug", async () => {
    expect((await getAllProductSlugs()).toSorted()).toEqual(seedProducts.map((p) => p.slug).toSorted());
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
    expect((await getNewArrivals(24)).map((p) => p.slug)).toEqual(seedProducts.slice(0, 24).map((p) => p.slug));
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
    const otherShoes = seedProducts.filter((p) => p.category === "shoes" && p.slug !== "double-monk-shoe");
    expect(otherShoes.length).toBeGreaterThanOrEqual(4);
    expect((await getRelatedProducts(shoe!)).map((p) => p.slug)).toEqual(otherShoes.slice(0, 4).map((p) => p.slug));
  });

  it("lists categories in creation order", async () => {
    // An update writes a new row version at the end of the table, so without an ORDER BY "bags"
    // would come back last.
    await db.update(categories).set({ name: "Bags" }).where(eq(categories.slug, "bags"));
    expect((await getCategories()).map((c) => c.slug)).toEqual([
      "bags",
      "shoes",
      "accessories",
      "jewellery",
      "ready-to-wear",
    ]);
  });
});
