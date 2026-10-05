import type { Metadata } from "next";

import { RESERVED_COLLECTION_SLUGS, resolveCollection } from "@/lib/catalog/collections";
import { getCategories, getCollectionProducts } from "@/lib/catalog/queries";
import { CollectionListing, presentCategories } from "../../collection-listing";

// A collection narrowed to one category tab (New, Women and Men have tabs). Prerendered for the
// tabs that have products at build time; other known categories render on first request (empty
// state). Unknown categories, and tabs under a category page, 404. Refreshed at most every 5 minutes.
export const revalidate = 300;
export const dynamicParams = true;

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

export default async function CollectionCategoryPage({ params }: PageProps<"/collections/[collection]/[category]">) {
  const { collection, category } = await params;
  return <CollectionListing collectionSlug={collection} categorySlug={category} />;
}
