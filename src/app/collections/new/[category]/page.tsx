import type { Metadata } from "next";

import { getCategories } from "@/lib/catalog/queries";
import { getNewArrivalsByCategory, NewArrivalsListing } from "../new-arrivals-listing";

// Prerendered for categories that have new arrivals at build time; other categories render on
// first request (empty state), unknown slugs 404. Refreshes at most every 5 minutes.
export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  const { categoriesWithArrivals } = await getNewArrivalsByCategory();
  return categoriesWithArrivals.map((category) => ({ category: category.slug }));
}

export async function generateMetadata({ params }: PageProps<"/collections/new/[category]">): Promise<Metadata> {
  const { category: slug } = await params;
  const category = (await getCategories()).find((c) => c.slug === slug);
  if (!category) return {};
  return {
    title: `New arrivals: ${category.name}`,
    description: `The latest ${category.name.toLowerCase()} from the workshop, newest first.`,
  };
}

export default async function NewArrivalsCategoryPage({ params }: PageProps<"/collections/new/[category]">) {
  return <NewArrivalsListing categorySlug={(await params).category} />;
}
