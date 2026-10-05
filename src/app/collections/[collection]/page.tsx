import type { Metadata } from "next";

import { RESERVED_COLLECTION_SLUGS, resolveCollection } from "@/lib/catalog/collections";
import { getCategories } from "@/lib/catalog/queries";
import { CollectionListing } from "../collection-listing";

// Prerendered for every collection (New, Women, Men and each category) and refreshed at most every
// 5 minutes. Categories added after the build render on first request; unknown slugs 404.
export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  const categories = await getCategories();
  return [...RESERVED_COLLECTION_SLUGS, ...categories.map((category) => category.slug)].map((collection) => ({ collection }));
}

export async function generateMetadata({ params }: PageProps<"/collections/[collection]">): Promise<Metadata> {
  const collection = resolveCollection((await params).collection, await getCategories());
  if (!collection) return {};
  return { title: collection.title, description: collection.description };
}

export default async function CollectionPage({ params }: PageProps<"/collections/[collection]">) {
  return <CollectionListing collectionSlug={(await params).collection} />;
}
