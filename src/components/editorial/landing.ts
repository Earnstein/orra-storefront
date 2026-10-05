import type { Metadata } from "next";

import type { EditorialPage } from "@/content/types";

/** Metadata for a landing page: its title and description, with the hero image for sharing. */
export function landingMetadata(page: EditorialPage): Metadata {
  const hero = page.blocks.find((block) => block.type === "hero");
  const image = hero && new URL(hero.image.src);
  image?.searchParams.set("w", "1200");
  return {
    title: page.title,
    description: page.description,
    openGraph: image && hero ? { images: [{ url: image.toString(), alt: hero.image.alt }] } : undefined,
  };
}
