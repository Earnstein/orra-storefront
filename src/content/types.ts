import type { CatalogImage } from "@/lib/catalog/types";

// Editorial pages (stories, the Women and Men landings) are typed content in code, built from
// blocks. EditorialBlocks renders them; findContentProblems in blocks.ts checks them in tests.

export type Action = { label: string; href: string };

export type Block =
  | {
      type: "hero";
      image: CatalogImage;
      /** object-position focal points: portrait crop on phones, wide crop from md up. */
      focal?: { mobile: string; desktop: string };
      eyebrow?: string;
      title: string;
      body?: string;
      action?: Action;
    }
  | { type: "categoryTiles"; heading: string; tiles: { label: string; href: string; productSlug: string }[] }
  | { type: "productRow"; heading: string; productSlugs: string[]; action?: Action }
  | { type: "story"; image: CatalogImage; title: string; body: string; action: Action }
  | { type: "text"; heading?: string; paragraphs: string[]; action?: Action }
  | { type: "image"; image: CatalogImage; caption?: string; width: "full" | "inset" }
  | { type: "quote"; text: string; attribution?: string };

export type EditorialPage = {
  slug: string;
  title: string;
  /** Meta description. */
  description: string;
  /** Set on the Women and Men landings: their products and tiles must suit that audience. */
  audience?: "women" | "men";
  blocks: Block[];
};

export type Story = EditorialPage & {
  /** One or two sentences shown on story cards and the homepage band. */
  standfirst: string;
  /** Card and Open Graph image. */
  image: CatalogImage;
};
