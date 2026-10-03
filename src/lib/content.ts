import type { CatalogImage } from "@/lib/catalog/types";

/**
 * Editorial homepage content (campaigns, collections, story, services). Products and
 * categories live in the database; see src/lib/catalog/queries.ts.
 * Photos are from Unsplash (free to use under the Unsplash License); each was checked
 * for visible third-party logos.
 */

/** Unsplash CDN URL; src/lib/image-loader.ts adds the size and format per request. */
function unsplash(id: string) {
  return `https://images.unsplash.com/photo-${id}`;
}

export type Collection = {
  slug: string;
  name: string;
  image: CatalogImage;
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
    action: { label: "Shop women", href: "/collections/women" },
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
    action: { label: "Shop men", href: "/collections/men" },
    image: {
      src: unsplash("1552374196-1ab2a1c593e8"),
      alt: "Man in a camel jacket and white tee seated on a wooden stool",
    },
    focal: { mobile: "60% 30%", desktop: "60% 18%" },
  },
];

export const featuredCollections: Collection[] = [
  {
    slug: "women",
    name: "Women's outerwear",
    image: {
      src: unsplash("1539109136881-3be0616acf4b"),
      alt: "Woman in a pale blue wool coat in a stone piazza",
    },
  },
  {
    slug: "men",
    name: "Tailoring",
    image: {
      src: unsplash("1507679799987-c73779587ccf"),
      alt: "Close-up of a man buttoning a navy suit jacket",
    },
  },
  {
    slug: "shoes",
    name: "Leather shoes",
    image: {
      src: unsplash("1614252235316-8c857d38b5f4"),
      alt: "Close-up of a brown leather lace-up shoe",
    },
  },
];

export const story = {
  title: "Knitwear, made slowly",
  body: "Each piece is knitted from undyed merino and finished by hand, then left to rest before it is pressed. It takes longer. It also keeps its shape for years.",
  href: "/stories/knitwear",
  linkLabel: "Read the story",
  image: {
    src: unsplash("1558769132-cb1aea458c5e"),
    alt: "Rail of neutral-toned knitwear beside dried pampas grass",
  },
};

export const services = [
  { icon: "truck", title: "Complimentary delivery", body: "On every order, tracked from dispatch to your door." },
  { icon: "returns", title: "30-day returns", body: "Send it back unworn within 30 days for a full refund." },
  { icon: "gift", title: "Gift wrapping", body: "Add wrapping and a handwritten note at checkout." },
] as const;
