/**
 * Sample catalogue for the homepage until products come from the database.
 * Photos are from Unsplash (free to use under the Unsplash License); each was checked
 * for visible third-party logos. Prices are integer cents.
 */

export type CatalogImage = { src: string; alt: string };

export type Product = {
  slug: string;
  name: string;
  category: string;
  price: number;
  image: CatalogImage;
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

export const hero = {
  title: "Dressed for the city",
  body: "Long coats, sharp tailoring and leather that softens with wear.",
  images: [
    {
      src: unsplash("1485968579580-b6d095142e6e"),
      alt: "Woman in a dark plaid coat walking down a city street",
    },
    {
      src: unsplash("1617137968427-85924c800a22"),
      alt: "Man in a navy suit and brown shoes outside a glass building",
    },
  ] satisfies CatalogImage[],
  actions: [
    { label: "Shop women", href: "/collections/women" },
    { label: "Shop men", href: "/collections/men" },
  ],
};

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

export const newArrivals: Product[] = [
  {
    slug: "top-handle-bag-teal",
    name: "Top-handle bag",
    category: "Bags",
    price: 189000,
    image: { src: unsplash("1594223274512-ad4803739b7c"), alt: "Teal leather top-handle bag" },
  },
  {
    slug: "double-monk-shoe",
    name: "Double-monk shoe",
    category: "Shoes",
    price: 79000,
    image: { src: unsplash("1533867617858-e7b97e060509"), alt: "Pair of brown double-monk-strap leather shoes" },
  },
  {
    slug: "round-sunglasses",
    name: "Round metal sunglasses",
    category: "Accessories",
    price: 42000,
    image: { src: unsplash("1511499767150-a48a237f0083"), alt: "Round gold-framed sunglasses on a white surface" },
  },
  {
    slug: "gold-hoop-earrings",
    name: "Twisted hoop earrings",
    category: "Jewellery",
    price: 56000,
    image: { src: unsplash("1617038220319-276d3cfab638"), alt: "Gold twisted hoop earrings beside a pebble" },
  },
  {
    slug: "leather-biker-jacket",
    name: "Leather biker jacket",
    category: "Ready-to-wear",
    price: 345000,
    image: { src: unsplash("1551028719-00167b16eac5"), alt: "Black leather biker jacket on a hanger" },
  },
  {
    slug: "bomber-jacket-rust",
    name: "Bomber jacket",
    category: "Ready-to-wear",
    price: 128000,
    image: { src: unsplash("1591047139829-d91aecb6caea"), alt: "Rust-coloured bomber jacket held up on a hanger" },
  },
  {
    slug: "floral-pump",
    name: "Floral satin pump",
    category: "Shoes",
    price: 89000,
    image: { src: unsplash("1543163521-1bf539c55dd2"), alt: "Floral-print stiletto pumps against a pale blue wall" },
  },
  {
    slug: "fringed-knit-poncho",
    name: "Fringed knit poncho",
    category: "Ready-to-wear",
    price: 98000,
    image: { src: unsplash("1434389677669-e08b4cac3105"), alt: "Cream open-knit poncho with fringe on a wooden hanger" },
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

export const spotlight = {
  slug: "chain-shoulder-bag-blush",
  name: "Chain shoulder bag",
  price: 145000,
  description: "A structured flap bag in smooth calf leather, with an inlaid chevron and a chain strap that doubles for evening.",
  details: [
    { term: "Material", value: "Calf leather" },
    { term: "Lining", value: "Suede" },
    { term: "Size", value: "24 × 16 × 7 cm" },
  ],
  image: {
    src: unsplash("1566150905458-1bf1fc113f0d"),
    alt: "Blush leather shoulder bag with a chevron inlay and chain strap",
  },
};

export const services = [
  { icon: "truck", title: "Complimentary delivery", body: "On every order, tracked from dispatch to your door." },
  { icon: "returns", title: "30-day returns", body: "Send it back unworn within 30 days for a full refund." },
  { icon: "gift", title: "Gift wrapping", body: "Add wrapping and a handwritten note at checkout." },
] as const;
