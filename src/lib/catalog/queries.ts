import { newArrivalSlugs, products, spotlightSlug, type Product } from "./sample-data";

// Read functions over the sample catalogue. Swap the bodies for database queries later;
// callers only depend on these signatures.

export function getProduct(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug);
}

export function getAllProductSlugs(): string[] {
  return products.map((product) => product.slug);
}

function bySlugs(slugs: string[]): Product[] {
  return slugs.map(getProduct).filter((product): product is Product => product !== undefined);
}

export function getNewArrivals(): Product[] {
  return bySlugs(newArrivalSlugs);
}

export function getSpotlightProduct(): Product {
  const product = getProduct(spotlightSlug);
  if (!product) throw new Error(`Spotlight product "${spotlightSlug}" is missing from the catalogue`);
  return product;
}

/** Same category first, then everything else; never the product itself. */
export function getRelatedProducts(product: Product, limit = 4): Product[] {
  const others = products.filter((p) => p.slug !== product.slug);
  const sameCategory = others.filter((p) => p.category.slug === product.category.slug);
  const rest = others.filter((p) => p.category.slug !== product.category.slug);
  return [...sameCategory, ...rest].slice(0, limit);
}
