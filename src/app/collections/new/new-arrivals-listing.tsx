import { notFound } from "next/navigation";

import { TextLink } from "@/components/primitives";
import { ProductListing } from "@/components/product/product-listing";
import { NEW_ARRIVALS_PAGE_LIMIT } from "@/lib/catalog/merchandising";
import { getCategories, getNewArrivals } from "@/lib/catalog/queries";

export const NEW_ARRIVALS_PATH = "/collections/new";

export const NEW_ARRIVALS_DESCRIPTION =
  "The latest pieces from the workshop, from leather bags to ready-to-wear. New runs land here first.";

/** The newest products, and the categories that appear among them (in category order). */
export async function getNewArrivalsByCategory() {
  const [products, categories] = await Promise.all([getNewArrivals(NEW_ARRIVALS_PAGE_LIMIT), getCategories()]);
  const present = new Set(products.map((product) => product.category.slug));
  return { products, categories, categoriesWithArrivals: categories.filter((c) => present.has(c.slug)) };
}

/** New arrivals, optionally narrowed to one category. Unknown categories 404. */
export async function NewArrivalsListing({ categorySlug }: { categorySlug?: string }) {
  const { products, categories, categoriesWithArrivals } = await getNewArrivalsByCategory();
  const category = categorySlug ? categories.find((c) => c.slug === categorySlug) : undefined;
  if (categorySlug && !category) notFound();

  const shown = category ? products.filter((product) => product.category.slug === category.slug) : products;
  const tabs = [
    { label: "All", href: NEW_ARRIVALS_PATH, current: !category },
    ...categoriesWithArrivals.map((c) => ({
      label: c.name,
      href: `${NEW_ARRIVALS_PATH}/${c.slug}`,
      current: c.slug === category?.slug,
    })),
  ];

  return (
    <ProductListing
      breadcrumbs={[
        { label: "Home", href: "/" },
        ...(category
          ? [{ label: "New arrivals", href: NEW_ARRIVALS_PATH }, { label: category.name }]
          : [{ label: "New arrivals" }]),
      ]}
      eyebrow={category ? "New arrivals" : undefined}
      title={category ? category.name : "New arrivals"}
      description={category ? undefined : NEW_ARRIVALS_DESCRIPTION}
      tabs={tabs}
      sortLabel="Newest first"
      products={shown}
      empty={
        <>
          <p className="text-title font-normal">
            {category ? `Nothing new in ${category.name.toLowerCase()} right now.` : "Nothing new right now."}
          </p>
          <TextLink href={category ? NEW_ARRIVALS_PATH : "/"} label>
            {category ? "See all new arrivals" : "Back to the homepage"}
          </TextLink>
        </>
      }
    />
  );
}
