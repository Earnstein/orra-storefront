import { describe, expect, it } from "vitest";

import type { Audience } from "@/db/schema/catalog";
import { categories, products } from "@/db/seed/catalog";
import { findContentProblems, type KnownContent } from "./blocks";
import { getStory, homepageStory, stories } from "./stories";

/**
 * What editorial content may refer to, from the seed catalogue. Previews are seeded from it and
 * production was seeded from it once; products edited later in a database aren't covered.
 */
function knownFromSeed(): KnownContent {
  const forAudience = (audience: Audience) =>
    new Set(products.filter((p) => p.audience === audience || p.audience === "unisex").map((p) => p.category));
  return {
    productAudiences: new Map(products.map((p) => [p.slug, p.audience])),
    categories: new Set(categories.map((c) => c.slug)),
    audienceCategories: { women: forAudience("women"), men: forAudience("men") },
    storySlugs: new Set(stories.map((story) => story.slug)),
  };
}

describe("stories", () => {
  it("only link to pages and products that exist, with checked images", () => {
    expect(findContentProblems(stories, knownFromSeed())).toEqual([]);
  });

  it("have unique slugs and are found by slug", () => {
    expect(new Set(stories.map((story) => story.slug)).size).toBe(stories.length);
    for (const story of stories) expect(getStory(story.slug)).toBe(story);
    expect(getStory("does-not-exist")).toBeUndefined();
  });

  it("follow the story layout: a hero, then copy, then Shop the story", () => {
    for (const story of stories) {
      const types = story.blocks.map((block) => block.type);
      expect(types[0], story.slug).toBe("hero");
      expect(story.blocks.find((block) => block.type === "hero")?.title, story.slug).toBe(story.title);
      const shop = story.blocks.findIndex((block) => block.type === "productRow" && block.heading === "Shop the story");
      expect(shop, story.slug).toBeGreaterThan(1);
      expect(types.slice(1, shop).every((type) => ["text", "image", "quote"].includes(type)), story.slug).toBe(true);
    }
  });

  it("feature knitwear on the homepage", () => {
    expect(homepageStory.slug).toBe("knitwear");
    expect(homepageStory.title).toBe("Knitwear, made slowly");
  });
});
