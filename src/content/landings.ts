import { heroSlides } from "@/lib/content";
import { getStory } from "./stories";
import type { Block, EditorialPage } from "./types";

// The Women and Men landing pages (/women, /men). content.test.ts checks their links, products
// and tiles against the seed catalogue and the audience.

type Audience = "women" | "men";

function hero(audience: Audience): Block {
  const slide = heroSlides.find((candidate) => candidate.id === audience);
  if (!slide) throw new Error(`No hero slide for ${audience}`);
  return {
    type: "hero",
    image: slide.image,
    focal: slide.focal,
    eyebrow: slide.label,
    title: slide.title,
    body: slide.body,
    action: shopAll(audience),
  };
}

function storyBlock(slug: string): Block {
  const story = getStory(slug);
  if (!story) throw new Error(`Unknown story ${slug}`);
  return {
    type: "story",
    image: story.image,
    title: story.title,
    body: story.standfirst,
    action: { label: "Read the story", href: `/stories/${story.slug}` },
  };
}

function shopAll(audience: Audience) {
  return { label: `Shop all ${audience}`, href: `/collections/${audience}` };
}

/** One tile per category, pictured by one of the audience's products. */
function categoryTiles(audience: Audience, picks: Record<string, string>): Block {
  const labels: Record<string, string> = {
    bags: "Bags",
    shoes: "Shoes",
    accessories: "Accessories",
    jewellery: "Jewellery",
    "ready-to-wear": "Ready-to-wear",
  };
  return {
    type: "categoryTiles",
    heading: "Shop by category",
    tiles: Object.entries(picks).map(([category, productSlug]) => ({
      label: labels[category] ?? category,
      href: `/collections/${audience}/${category}`,
      productSlug,
    })),
  };
}

const women: EditorialPage = {
  slug: "women",
  title: "Women",
  description: "Women's bags, shoes, jewellery and ready-to-wear, with a hand-picked edit and stories from our workshops.",
  audience: "women",
  blocks: [
    hero("women"),
    categoryTiles("women", {
      bags: "croc-top-handle-yellow",
      shoes: "patent-slingback-black",
      accessories: "wool-beret-red",
      jewellery: "pearl-stud-earrings",
      "ready-to-wear": "slip-dress-black",
    }),
    {
      type: "productRow",
      heading: "The edit",
      productSlugs: [
        "structured-handbag-brown",
        "strappy-sandal-silver",
        "knit-sweater-rust",
        "butterfly-brooch",
        "slouchy-hobo-black",
        "slouch-boot-black",
        "heart-drop-earrings-blue",
        "wire-sunglasses-gold",
      ],
    },
    storyBlock("knitwear"),
    {
      type: "text",
      heading: "Everything, in one place",
      paragraphs: ["Every bag, shoe and piece of jewellery we make for women, alongside our unisex pieces, newest first."],
      action: shopAll("women"),
    },
  ],
};

const men: EditorialPage = {
  slug: "men",
  title: "Men",
  description: "Men's bags, shoes, accessories and ready-to-wear, with a hand-picked edit and stories from our workshops.",
  audience: "men",
  blocks: [
    hero("men"),
    categoryTiles("men", {
      bags: "buckled-briefcase-brown",
      shoes: "chelsea-boot-brown",
      accessories: "straw-trilby",
      jewellery: "steel-band-ring",
      "ready-to-wear": "overcoat-camel",
    }),
    {
      type: "productRow",
      heading: "The edit",
      productSlugs: [
        "leather-messenger-brown",
        "penny-loafer-brown",
        "leather-jacket-brown",
        "merino-v-neck",
        "leather-rucksack-tan",
        "derby-shoe-tan",
        "browline-sunglasses-black",
        "braided-belt-brown",
      ],
    },
    storyBlock("leather-workshop"),
    {
      type: "text",
      heading: "Everything, in one place",
      paragraphs: ["Every bag, shoe and piece of tailoring we make for men, alongside our unisex pieces, newest first."],
      action: shopAll("men"),
    },
  ],
};

export const landings: Record<Audience, EditorialPage> = { women, men };
