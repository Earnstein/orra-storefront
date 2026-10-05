import { describe, expect, it } from "vitest";

import type { Audience } from "@/db/schema/catalog";
import { collectProductSlugs, findContentProblems, type KnownContent } from "./blocks";
import type { Block, EditorialPage } from "./types";

const photo = (src = "https://images.unsplash.com/photo-1") => ({ src, alt: "A photo" });

const hero: Block = { type: "hero", image: photo(), title: "Hero" };
const text: Block = { type: "text", paragraphs: ["Copy."] };
const row = (productSlugs: string[]): Block => ({ type: "productRow", heading: "Shop", productSlugs });
const tiles = (productSlugs: string[], href = "/collections/bags"): Block => ({
  type: "categoryTiles",
  heading: "Shop by category",
  tiles: productSlugs.map((productSlug) => ({ label: "Tile", href, productSlug })),
});
const textWithAction = (href: string): Block => ({ type: "text", paragraphs: ["Copy."], action: { label: "Go", href } });
const image = (src: string, alt = "A photo"): Block => ({ type: "image", image: { src, alt }, width: "inset" });
const page = (overrides: Partial<EditorialPage> = {}): EditorialPage => ({
  slug: "page",
  title: "Page",
  description: "A page.",
  blocks: [],
  ...overrides,
});

const known: KnownContent = {
  productAudiences: new Map<string, Audience>([
    ["top-handle-bag-teal", "women"],
    ["double-monk-shoe", "men"],
    ["leather-tote-tan", "unisex"],
  ]),
  categories: new Set(["bags", "shoes", "jewellery"]),
  audienceCategories: { women: new Set(["bags", "jewellery"]), men: new Set(["bags", "shoes"]) },
  storySlugs: new Set(["knitwear"]),
};

describe("collectProductSlugs", () => {
  it("collects product slugs from rows and tiles, deduplicated in first-seen order", () => {
    expect(collectProductSlugs([hero, row(["a", "b"]), tiles(["c", "a"]), text])).toEqual(["a", "b", "c"]);
  });

  it("returns nothing for blocks without products", () => {
    expect(collectProductSlugs([hero, text])).toEqual([]);
  });
});

describe("findContentProblems", () => {
  const validPage = page({
    audience: "men",
    blocks: [
      { ...hero, action: { label: "Shop", href: "/collections/men" } },
      tiles(["double-monk-shoe"], "/collections/men/shoes"),
      row(["double-monk-shoe", "leather-tote-tan"]),
      { type: "story", image: photo(), title: "Story", body: "Copy.", action: { label: "Read", href: "/stories/knitwear" } },
      textWithAction("/products/leather-tote-tan"),
      image("https://images.unsplash.com/photo-2?ar=4:5&fit=crop"),
      { type: "quote", text: "A quote." },
    ],
  });

  it("accepts a valid page", () => {
    expect(findContentProblems([validPage], known)).toEqual([]);
  });

  it("reports unknown products", () => {
    expect(findContentProblems([page({ blocks: [row(["nope"])] })], known)).toEqual([expect.stringContaining("nope")]);
    expect(findContentProblems([page({ blocks: [tiles(["nope"])] })], known)).toHaveLength(1);
  });

  it("accepts every internal route shape", () => {
    const hrefs = [
      "/",
      "/women",
      "/men",
      "/stories",
      "/stories/knitwear",
      "/products/double-monk-shoe",
      "/collections/new",
      "/collections/new/shoes",
      "/collections/women/bags",
      "/collections/men",
      "/collections/jewellery",
    ];
    expect(findContentProblems([page({ blocks: hrefs.map(textWithAction) })], known)).toEqual([]);
  });

  it("reports links that would 404", () => {
    for (const href of [
      "/collections/bags/shoes",
      "/collections/unknown",
      "/collections/women/unknown",
      "/stories/unknown",
      "/products/unknown",
      "/about",
      "collections/new",
    ]) {
      expect(findContentProblems([page({ blocks: [textWithAction(href)] })], known), href).toHaveLength(1);
    }
  });

  it("reports images that aren't on Unsplash's free CDN or lack alt text", () => {
    expect(findContentProblems([page({ blocks: [image("https://plus.unsplash.com/premium_photo-1")] })], known)).toHaveLength(1);
    expect(findContentProblems([page({ blocks: [image("https://example.com/photo.jpg")] })], known)).toHaveLength(1);
    expect(findContentProblems([page({ blocks: [image("https://images.unsplash.com/photo-1", " ")] })], known)).toHaveLength(1);
  });

  it("checks every image: hero, story split, image block and the page's own", () => {
    const bad = photo("https://plus.unsplash.com/premium_photo-1");
    const action = { label: "Read", href: "/stories/knitwear" };
    expect(findContentProblems([page({ blocks: [{ ...hero, image: bad }] })], known)).toHaveLength(1);
    expect(findContentProblems([page({ blocks: [{ type: "story", image: bad, title: "S", body: "B", action }] })], known)).toHaveLength(1);
    expect(findContentProblems([{ ...page(), image: bad }], known)).toHaveLength(1);
  });

  it("keeps an audience page to that audience's products and categories", () => {
    // A women's product on the Men page.
    expect(findContentProblems([page({ audience: "men", blocks: [row(["top-handle-bag-teal"])] })], known)).toHaveLength(1);
    // Men have no jewellery to show.
    expect(
      findContentProblems([page({ audience: "men", blocks: [tiles(["double-monk-shoe"], "/collections/men/jewellery")] })], known),
    ).toHaveLength(1);
  });

  it("names the page in each problem", () => {
    expect(findContentProblems([page({ slug: "knitwear", blocks: [row(["nope"])] })], known)).toEqual([
      expect.stringContaining("knitwear"),
    ]);
  });
});
