import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ResultsSection } from "@/components/listing/results-section";
import { ResultsSkeleton } from "@/components/listing/results-skeleton";
import { TextLink } from "@/components/primitives";
import { ProductListing } from "@/components/product/product-listing";
import { resolveCollection } from "@/lib/catalog/collections";
import { getCategories, getCollectionProducts } from "@/lib/catalog/queries";
import type { Category, Product } from "@/lib/catalog/types";

/** Builds a collection URL from unescaped slugs; an omitted or empty category selects the collection root. */
export function collectionPath(collectionSlug: string, categorySlug?: string) {
  return categorySlug ? `/collections/${collectionSlug}/${categorySlug}` : `/collections/${collectionSlug}`;
}

/** The categories that products fall into, in category order: a collection's tabs. */
export function presentCategories(products: Product[], categories: Category[]): Category[] {
  const present = new Set(products.map((product) => product.category.slug));
  return categories.filter((category) => present.has(category.slug));
}

/**
 * A collection listing, optionally narrowed to one category tab. 404s for an unknown collection or
 * category, or a tab under a collection that has none; a known category with no products in this
 * collection shows the empty state.
 * The heading and tabs are part of the prerendered page; the results depend on the URL's filters,
 * sort and page, so they stream in under <Suspense>. Category filtering happens after the
 * collection's product limit, so New tabs only narrow the newest batch. Database errors propagate
 * instead of showing the empty state.
 */
export async function CollectionListing({
  collectionSlug,
  categorySlug,
  searchParams,
}: {
  collectionSlug: string;
  categorySlug?: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const categories = await getCategories();
  const collection = resolveCollection(collectionSlug, categories);
  if (!collection) notFound();
  const category = categorySlug === undefined ? undefined : categories.find((candidate) => candidate.slug === categorySlug);
  if (categorySlug !== undefined && (!collection.hasTabs || !category)) notFound();

  const tabs = collection.hasTabs
    ? [
        { label: "All", href: collectionPath(collection.slug), current: !category },
        ...presentCategories(await getCollectionProducts(collection.scope), categories).map((present) => ({
          label: present.name,
          href: collectionPath(collection.slug, present.slug),
          current: present.slug === category?.slug,
        })),
      ]
    : undefined;

  return (
    <ProductListing
      breadcrumbs={[
        { label: "Home", href: "/" },
        ...(category
          ? [{ label: collection.title, href: collectionPath(collection.slug) }, { label: category.name }]
          : [{ label: collection.title }]),
      ]}
      eyebrow={category ? collection.title : undefined}
      title={category ? category.name : collection.title}
      description={category ? undefined : collection.description}
      tabs={tabs}
    >
      <Suspense fallback={<ResultsSkeleton />}>
        <ResultsSection
          scope={collection.scope}
          tab={category?.slug}
          searchParams={searchParams}
          empty={
            <>
              <p className="text-title font-normal">
                {category ? `Nothing in ${category.name.toLowerCase()} here right now.` : "Nothing here right now."}
              </p>
              <TextLink href={category ? collectionPath(collection.slug) : "/"} label>
                {category ? `Back to ${collection.title}` : "Back to the homepage"}
              </TextLink>
            </>
          }
        />
      </Suspense>
    </ProductListing>
  );
}
