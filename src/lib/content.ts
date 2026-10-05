import type { CatalogImage } from "@/lib/catalog/types";

/**
 * Editorial homepage content (campaigns, collections, services; stories are in src/content). Products and
 * categories live in the database; see src/lib/catalog/queries.ts.
 * Photos are from Unsplash (free to use under the Unsplash License); each was checked
 * for visible third-party logos.
 */

/** Unsplash CDN URL; src/lib/image-loader.ts adds the size and format per request. */
function unsplash(id: string) {
  return `https://images.unsplash.com/photo-${id}`;
}

/** A homepage tile that links into a collection listing. */
export type FeaturedCollection = {
  href: string;
  name: string;
  image: CatalogImage;
};

/**
 * Collection listing copy (see src/lib/catalog/collections.ts): titles and one-line descriptions
 * for the built-in collections, and a description per category. Category titles come from the
 * database.
 */
export const collectionCopy = {
  new: {
    title: "New arrivals",
    description:
      "The latest pieces from the workshop, from leather bags to ready-to-wear. New runs land here first.",
  },
  women: {
    title: "Women",
    description: "Bags, shoes, jewellery and ready-to-wear for women, alongside our unisex pieces.",
  },
  men: {
    title: "Men",
    description: "Shoes, bags, accessories and ready-to-wear for men, alongside our unisex pieces.",
  },
  categories: {
    bags: "Totes and top-handles in calf leather, cut to soften and darken with use.",
    shoes: "Pumps, loafers and lace-ups, made on lasts we have refined over many seasons.",
    accessories: "Sunglasses, belts and small leather goods to finish the look.",
    jewellery: "Hoops, chains and rings in recycled gold and silver.",
    "ready-to-wear": "Outerwear and knitwear, made to layer through the season.",
  } as Record<string, string | undefined>,
};

export type HeroSlide = {
  id: string;
  /** Short name for the slide picker, e.g. "Women". */
  label: string;
  title: string;
  body: string;
  action: { label: string; href: string };
  image: CatalogImage;
  /** object-position focal points: portrait crop on phones, wide crop from md up. */
  focal: { mobile: string; desktop: string };
};

export const heroSlides: HeroSlide[] = [
  {
    id: "women",
    label: "Women",
    title: "Coats for the long walk home",
    body: "Soft wool coats and silk scarves, cut to layer through the season.",
    action: { label: "Shop women", href: "/women" },
    image: {
      src: unsplash("1485462537746-965f33f7f6a7"),
      alt: "Woman in a pink wool coat and patterned scarf beneath a stone arcade",
    },
    focal: { mobile: "50% 40%", desktop: "50% 28%" },
  },
  {
    id: "men",
    label: "Men",
    title: "Tailoring, softened",
    body: "Unstructured camel jackets over plain tees. Sharp enough for work, easy enough for the weekend.",
    action: { label: "Shop men", href: "/men" },
    image: {
      src: unsplash("1552374196-1ab2a1c593e8"),
      alt: "Man in a camel jacket and white tee seated on a wooden stool",
    },
    focal: { mobile: "60% 30%", desktop: "60% 18%" },
  },
];

export const featuredCollections: FeaturedCollection[] = [
  {
    href: "/collections/women/ready-to-wear",
    name: "Women's outerwear",
    image: {
      src: unsplash("1539109136881-3be0616acf4b"),
      alt: "Woman in a pale blue wool coat in a stone piazza",
    },
  },
  {
    href: "/collections/men/ready-to-wear",
    name: "Tailoring",
    image: {
      src: unsplash("1507679799987-c73779587ccf"),
      alt: "Close-up of a man buttoning a navy suit jacket",
    },
  },
  {
    href: "/collections/shoes",
    name: "Leather shoes",
    image: {
      src: unsplash("1614252235316-8c857d38b5f4"),
      alt: "Close-up of a brown leather lace-up shoe",
    },
  },
];

export const services = [
  { icon: "truck", title: "Complimentary delivery", body: "On every order, tracked from dispatch to your door." },
  { icon: "returns", title: "30-day returns", body: "Send it back unworn within 30 days for a full refund." },
  { icon: "gift", title: "Gift wrapping", body: "Add wrapping and a handwritten note at checkout." },
] as const;
