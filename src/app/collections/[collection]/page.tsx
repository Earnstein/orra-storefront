import type { Metadata } from "next";

import { RESERVED_COLLECTION_SLUGS, resolveCollection } from "@/lib/catalog/collections";
import { getCategories } from "@/lib/catalog/queries";
import { CollectionListing } from "../collection-listing";

// Prerendered for every collection (New, Women, Men and each category) from cached catalogue
// reads. Categories added after the build render on first request; unknown slugs 404.

/** Returns build-time paths for built-in collections and all database categories; database errors propagate. */
export async function generateStaticParams() {
  const categories = await getCategories();
  return [...RESERVED_COLLECTION_SLUGS, ...categories.map((category) => category.slug)].map((collection) => ({ collection }));
}

/**
 * Returns collection copy as metadata, or empty metadata for an unknown slug.
 * Database errors propagate; unknown routes are rejected when the listing renders.
 */
export async function generateMetadata({ params }: PageProps<"/collections/[collection]">): Promise<Metadata> {
  const collection = resolveCollection((await params).collection, await getCategories());
  if (!collection) return {};
  return { title: collection.title, description: collection.description };
}

/** Renders the requested collection, delegating slug validation and data loading to CollectionListing. */
export default async function CollectionPage({ params }: PageProps<"/collections/[collection]">) {
  return <CollectionListing collectionSlug={(await params).collection} />;
}
