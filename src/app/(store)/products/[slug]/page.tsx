import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductGallery } from "@/components/product/product-gallery";
import { ProductInfo } from "@/components/product/product-info";
import { RelatedProducts } from "@/components/product/related-products";
import { getAllProductSlugs, getProduct, getRelatedProducts } from "@/lib/catalog/queries";
import { stockStatus } from "@/lib/catalog/stock";
import { ogImage } from "@/lib/metadata";
import { site } from "@/lib/site";

// Product pages are prerendered from cached catalogue reads, so stock and price edits show up
// within 5 minutes without a deploy. Products added after the build render on first request;
// unknown slugs 404.

// Params outside generateStaticParams (including unknown slugs) render on request and must block
// rather than stream, so notFound() still returns a real 404 (streaming would send a 200 first).
export const instant = false;

export async function generateStaticParams() {
  return (await getAllProductSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.description,
    openGraph: { images: [ogImage(product.images[0])] },
  };
}

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const product = await getProduct((await params).slug);
  if (!product) notFound();

  const availability = {
    in_stock: "https://schema.org/InStock",
    low_stock: "https://schema.org/LimitedAvailability",
    out_of_stock: "https://schema.org/OutOfStock",
  }[stockStatus(product.stock).state];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images.map((image) => image.src),
    category: product.category.name,
    color: product.colour,
    brand: { "@type": "Brand", name: site.name },
    offers: {
      "@type": "Offer",
      price: (product.price / 100).toFixed(2),
      priceCurrency: site.currency,
      availability,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify output with "<" escaped cannot break out of the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      {/* Gallery sits on the left gutter, details end on the right gutter (matching the header),
          with at least a section-sized gap between them. Details are capped for line length. */}
      <div className="grid lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-x-section lg:px-gutter">
        <div className="lg:sticky lg:top-header lg:self-start lg:py-block">
          <ProductGallery images={product.images} name={product.name} />
        </div>
        <div className="px-gutter pt-block pb-section lg:px-0">
          <div className="lg:sticky lg:top-[calc(var(--spacing-header)+var(--spacing-block))] lg:ml-auto lg:max-w-xl">
            <ProductInfo product={product} />
          </div>
        </div>
      </div>
      <RelatedProducts products={await getRelatedProducts(product)} />
    </>
  );
}
