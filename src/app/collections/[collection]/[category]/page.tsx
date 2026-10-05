import type { Metadata } from "next";

import { RESERVED_COLLECTION_SLUGS, resolveCollection } from "@/lib/catalog/collections";
import { getCategories, getCollectionProducts } from "@/lib/catalog/queries";
import { CollectionListing, presentCategories } from "../../collection-listing";

// A collection narrowed to one category tab (New, Women and Men have tabs). Prerendered for the
// tabs that have products at build time; other known categories render on first request (empty
// state). Unknown categories, and tabs under a category page, 404.

// Params outside generateStaticParams (including unknown slugs) render on request and must block
// rather than stream, so notFound() still returns a real 404 (streaming would send a 200 first).
export const instant = false;

/**
 * Returns build-time paths for categories represented in New, Women, and Men.
 * New uses its limited batch of arrivals. Database errors propagate.
 */
export async function generateStaticParams() {
  const categories = await getCategories();
  const params: { collection: string; category: string }[] = [];
  for (const slug of RESERVED_COLLECTION_SLUGS) {
    const collection = resolveCollection(slug, categories);
    if (!collection?.hasTabs) continue;
    const products = await getCollectionProducts(collection.scope);
    for (const category of presentCategories(products, categories)) params.push({ collection: slug, category: category.slug });
  }
  return params;
}

/**
 * Returns category metadata even for an empty listing, or empty metadata for an unknown
 * category or a collection without tabs. Database errors propagate; the listing handles 404s.
 */
export async function generateMetadata({ params }: PageProps<"/collections/[collection]/[category]">): Promise<Metadata> {
  const { collection: collectionSlug, category: categorySlug } = await params;
  const categories = await getCategories();
  const collection = resolveCollection(collectionSlug, categories);
  const category = categories.find((candidate) => candidate.slug === categorySlug);
  if (!collection?.hasTabs || !category) return {};
  return {
    title: `${collection.title}: ${category.name}`,
    description:
      collection.scope.kind === "new"
        ? `The latest ${category.name.toLowerCase()} from the workshop, newest first.`
        : `${category.name} for ${collection.title.toLowerCase()}, newest first.`,
  };
}

/** Renders a category tab, delegating collection and category validation to CollectionListing. */
export default async function CollectionCategoryPage({ params }: PageProps<"/collections/[collection]/[category]">) {
  const { collection, category } = await params;
  return <CollectionListing collectionSlug={collection} categorySlug={category} />;
}
