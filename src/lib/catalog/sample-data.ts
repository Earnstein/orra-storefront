/**
 * Sample catalogue until products come from the database.
 * Photos are from Unsplash (free to use under the Unsplash License); each was checked
 * for visible third-party logos. Prices are integer cents.
 */

export type CatalogImage = { src: string; alt: string };

export type Product = {
  slug: string;
  name: string;
  category: { slug: string; name: string };
  price: number;
  colour: string;
  description: string;
  details: { term: string; value: string }[];
  /** Units available to sell. Status (in stock / low / sold out) is derived in stock.ts. */
  stock: number;
  /** First image is the primary shot used on product cards. */
  images: CatalogImage[];
};

export type Collection = {
  slug: string;
  name: string;
  image: CatalogImage;
};

/** Unsplash CDN URL; src/lib/image-loader.ts adds the size and format per request. */
function unsplash(id: string) {
  return `https://images.unsplash.com/photo-${id}`;
}

/**
 * Gallery for a product that has a single photo: the full 4:5 shot plus close-ups cropped
 * by Unsplash's CDN around focal points (x, y in 0–1, zoom ≥ 1).
 */
function gallery(id: string, alt: string, closeUps: { x: number; y: number; zoom: number; alt: string }[]) {
  const crop = (x: number, y: number, zoom: number) =>
    `${unsplash(id)}?ar=4:5&fit=crop&crop=focalpoint&fp-x=${x}&fp-y=${y}&fp-z=${zoom}`;
  return [
    { src: crop(0.5, 0.5, 1), alt },
    ...closeUps.map((c) => ({ src: crop(c.x, c.y, c.zoom), alt: c.alt })),
  ];
}

const categories = {
  bags: { slug: "bags", name: "Bags" },
  shoes: { slug: "shoes", name: "Shoes" },
  accessories: { slug: "accessories", name: "Accessories" },
  jewellery: { slug: "jewellery", name: "Jewellery" },
  readyToWear: { slug: "ready-to-wear", name: "Ready-to-wear" },
} as const;

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

export const products: Product[] = [
  {
    slug: "top-handle-bag-teal",
    name: "Top-handle bag",
    category: categories.bags,
    price: 189000,
    colour: "Teal",
    description:
      "A compact top-handle bag in pebbled calf leather, with a polished push-lock and a detachable shoulder strap.",
    details: [
      { term: "Material", value: "Pebbled calf leather" },
      { term: "Lining", value: "Cotton twill" },
      { term: "Hardware", value: "Gold-tone brass" },
      { term: "Size", value: "26 × 19 × 11 cm" },
    ],
    stock: 12,
    images: gallery("1594223274512-ad4803739b7c", "Teal leather top-handle bag", [
      { x: 0.5, y: 0.45, zoom: 2.2, alt: "Close-up of the handle and pebbled leather grain" },
      { x: 0.35, y: 0.6, zoom: 2.6, alt: "Close-up of the bag's gold push-lock" },
    ]),
  },
  {
    slug: "double-monk-shoe",
    name: "Double-monk shoe",
    category: categories.shoes,
    price: 79000,
    colour: "Tan",
    description: "Goodyear-welted double-monk straps in burnished calf, on a leather sole with a stacked heel.",
    details: [
      { term: "Upper", value: "Burnished calf leather" },
      { term: "Sole", value: "Leather, Goodyear welted" },
      { term: "Heel", value: "2.5 cm stacked leather" },
    ],
    stock: 2,
    images: gallery("1533867617858-e7b97e060509", "Pair of brown double-monk-strap leather shoes", [
      { x: 0.55, y: 0.55, zoom: 2.2, alt: "Close-up of the double buckle straps" },
    ]),
  },
  {
    slug: "round-sunglasses",
    name: "Round metal sunglasses",
    category: categories.accessories,
    price: 42000,
    colour: "Gold / green",
    description: "Thin gold-tone frames with round green lenses and adjustable nose pads. Supplied with a leather case.",
    details: [
      { term: "Frame", value: "Gold-tone metal" },
      { term: "Lenses", value: "Green, 100% UV protection" },
      { term: "Lens width", value: "49 mm" },
    ],
    stock: 18,
    images: gallery("1511499767150-a48a237f0083", "Round gold-framed sunglasses on a white surface", [
      { x: 0.5, y: 0.5, zoom: 2.4, alt: "Close-up of the gold bridge and green lenses" },
    ]),
  },
  {
    slug: "gold-hoop-earrings",
    name: "Twisted hoop earrings",
    category: categories.jewellery,
    price: 56000,
    colour: "Gold",
    description: "Medium hoops in a twisted rope profile, cast in recycled sterling silver with 18k gold vermeil.",
    details: [
      { term: "Material", value: "18k gold vermeil on recycled silver" },
      { term: "Diameter", value: "2.4 cm" },
      { term: "Fastening", value: "Hinged clasp" },
    ],
    stock: 0,
    images: gallery("1617038220319-276d3cfab638", "Gold twisted hoop earrings beside a pebble", [
      { x: 0.55, y: 0.55, zoom: 2.4, alt: "Close-up of the twisted hoop profile" },
    ]),
  },
  {
    slug: "leather-biker-jacket",
    name: "Leather biker jacket",
    category: categories.readyToWear,
    price: 345000,
    colour: "Black",
    description:
      "An asymmetric biker in supple lambskin, with an off-centre zip, snap-down lapels and a belted hem.",
    details: [
      { term: "Material", value: "Lambskin leather" },
      { term: "Lining", value: "Cupro" },
      { term: "Fit", value: "True to size, cropped at the hip" },
    ],
    stock: 5,
    // Source is 1492px wide, so close-ups stay at a modest zoom.
    images: gallery("1521223890158-f9f7c3d5d504", "Black leather biker jacket worn open over a black tee", [
      { x: 0.8, y: 0.2, zoom: 1.8, alt: "Close-up of the snap-down lapel" },
      { x: 0.12, y: 0.45, zoom: 1.8, alt: "Close-up of the zipped chest pocket" },
    ]),
  },
  {
    slug: "bomber-jacket-rust",
    name: "Bomber jacket",
    category: categories.readyToWear,
    price: 128000,
    colour: "Rust",
    description: "A lightweight bomber in washed nylon twill with ribbed trims and a two-way zip.",
    details: [
      { term: "Material", value: "Washed nylon twill" },
      { term: "Trims", value: "Ribbed wool blend" },
      { term: "Fit", value: "Relaxed" },
    ],
    stock: 9,
    images: gallery("1591047139829-d91aecb6caea", "Rust-coloured bomber jacket held up on a hanger", [
      { x: 0.5, y: 0.7, zoom: 2.2, alt: "Close-up of the zip and ribbed hem" },
    ]),
  },
  {
    slug: "floral-pump",
    name: "Floral satin pump",
    category: categories.shoes,
    price: 89000,
    colour: "Blue floral",
    description: "A pointed pump in printed duchess satin on a slim 10 cm heel, with a leather sole.",
    details: [
      { term: "Upper", value: "Printed duchess satin" },
      { term: "Heel", value: "10 cm" },
      { term: "Sole", value: "Leather" },
    ],
    stock: 3,
    images: gallery("1543163521-1bf539c55dd2", "Floral-print stiletto pumps against a pale blue wall", [
      { x: 0.45, y: 0.65, zoom: 2.2, alt: "Close-up of the floral satin print" },
    ]),
  },
  {
    slug: "fringed-knit-poncho",
    name: "Fringed knit poncho",
    category: categories.readyToWear,
    price: 98000,
    colour: "Ecru",
    description: "An open-knit poncho in undyed cotton and linen, finished with a hand-knotted fringe.",
    details: [
      { term: "Material", value: "Cotton and linen" },
      { term: "Knit", value: "Open crochet stitch" },
      { term: "Size", value: "One size" },
    ],
    stock: 7,
    images: gallery("1434389677669-e08b4cac3105", "Cream open-knit poncho with fringe on a wooden hanger", [
      { x: 0.5, y: 0.75, zoom: 2.2, alt: "Close-up of the knotted fringe" },
    ]),
  },
  {
    slug: "leather-tote-tan",
    name: "Leather tote",
    category: categories.bags,
    price: 98000,
    colour: "Tan",
    description:
      "An unlined tote in waxed, vegetable-tanned leather that darkens and softens with wear, with saddle-stitched handles and brass rivets.",
    details: [
      { term: "Material", value: "Waxed vegetable-tanned leather" },
      { term: "Handles", value: "Saddle-stitched, 24 cm drop" },
      { term: "Hardware", value: "Solid brass rivets" },
      { term: "Size", value: "34 × 36 × 10 cm" },
    ],
    stock: 4,
    images: gallery("1624687943971-e86af76d57de", "Tan waxed-leather tote hanging from a white door", [
      { x: 0.33, y: 0.46, zoom: 2.4, alt: "Close-up of a brass rivet and saddle stitching on the handle" },
      { x: 0.55, y: 0.68, zoom: 2.2, alt: "Close-up of the waxed leather's natural markings" },
    ]),
  },
];

/** Homepage "New this season" grid, in display order. */
export const newArrivalSlugs = [
  "top-handle-bag-teal",
  "double-monk-shoe",
  "round-sunglasses",
  "gold-hoop-earrings",
  "leather-biker-jacket",
  "bomber-jacket-rust",
  "floral-pump",
  "fringed-knit-poncho",
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

/** Homepage product spotlight; the product itself comes from `products`. */
export const spotlightSlug = "leather-tote-tan";

export const services = [
  { icon: "truck", title: "Complimentary delivery", body: "On every order, tracked from dispatch to your door." },
  { icon: "returns", title: "30-day returns", body: "Send it back unworn within 30 days for a full refund." },
  { icon: "gift", title: "Gift wrapping", body: "Add wrapping and a handwritten note at checkout." },
] as const;
