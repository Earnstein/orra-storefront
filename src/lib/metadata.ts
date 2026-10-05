import type { Metadata } from "next";

import type { EditorialPage } from "@/content/types";
import type { CatalogImage } from "@/lib/catalog/types";

/** Open Graph image for an Unsplash photo: Unsplash's CDN resizes it to 1200px, keeping any crop. */
export function ogImage(image: CatalogImage) {
  const url = new URL(image.src);
  url.searchParams.set("w", "1200");
  return { url: url.toString(), alt: image.alt };
}

/** A landing page's title and description, with its hero image for sharing. */
export function landingMetadata(page: EditorialPage): Metadata {
  const hero = page.blocks.find((block) => block.type === "hero");
  return {
    title: page.title,
    description: page.description,
    openGraph: hero ? { images: [ogImage(hero.image)] } : undefined,
  };
}
