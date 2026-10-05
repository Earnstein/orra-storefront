import { describe, expect, it } from "vitest";

import type { Audience } from "@/db/schema/catalog";
import { categories, products } from "@/db/seed/catalog";
import { findContentProblems, type KnownContent } from "./blocks";
import { landings } from "./landings";
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

describe("Women and Men landings", () => {
  const known = knownFromSeed();
  const audiences = ["women", "men"] as const;

  it("only link to pages and products that exist and suit the audience", () => {
    expect(findContentProblems(Object.values(landings), known)).toEqual([]);
  });

  it("follow the landing layout: hero, categories, the edit, a story, then Shop all", () => {
    for (const audience of audiences) {
      const landing = landings[audience];
      expect(landing.audience).toBe(audience);
      expect(landing.blocks.map((block) => block.type)).toEqual(["hero", "categoryTiles", "productRow", "story", "text"]);
      const [hero, tiles, edit, , closing] = landing.blocks;
      const shopAll = { label: `Shop all ${audience}`, href: `/collections/${audience}` };
      expect(hero.type === "hero" && hero.action).toEqual(shopAll);
      expect(closing.type === "text" && closing.action).toEqual(shopAll);
      expect(edit.type === "productRow" && edit.heading).toBe("The edit");
      expect(edit.type === "productRow" && new Set(edit.productSlugs).size).toBe(8);
      // A tile for every category the audience can shop, in the catalogue's order and named as
      // there, each opening that tab.
      const expected = categories.filter((category) => known.audienceCategories[audience].has(category.slug));
      expect(tiles.type === "categoryTiles" && tiles.tiles.map(({ label, href }) => ({ label, href }))).toEqual(
        expected.map((category) => ({ label: category.name, href: `/collections/${audience}/${category.slug}` })),
      );
    }
  });
});

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
