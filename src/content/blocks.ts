import type { Audience } from "@/db/schema/catalog";
import { RESERVED_COLLECTION_SLUGS } from "@/lib/catalog/collections";
import type { CatalogImage } from "@/lib/catalog/types";
import type { Action, Block, EditorialPage } from "./types";

/** Product slugs the blocks show, deduplicated in first-seen order, so a page fetches them in one query. */
export function collectProductSlugs(blocks: Block[]): string[] {
  const slugs = blocks.flatMap((block) => {
    if (block.type === "productRow") return block.productSlugs;
    if (block.type === "categoryTiles") return block.tiles.map((tile) => tile.productSlug);
    return [];
  });
  return [...new Set(slugs)];
}

/** What editorial content may refer to, built from the catalogue (the seed, in tests). */
export type KnownContent = {
  productAudiences: Map<string, Audience>;
  categories: Set<string>;
  /** Categories that have products for the audience, counting unisex ones. */
  audienceCategories: Record<"women" | "men", Set<string>>;
  storySlugs: Set<string>;
};

/**
 * Problems that would show up as a broken page: links that 404, unknown products, images that
 * aren't on Unsplash's free CDN or lack alt text, and products or categories on an audience
 * page that the audience doesn't have. Returns one message per problem, naming the page.
 */
export function findContentProblems(pages: (EditorialPage & { image?: CatalogImage })[], known: KnownContent): string[] {
  const problems: string[] = [];
  for (const page of pages) {
    const report = (message: string) => problems.push(`${page.slug}: ${message}`);
    const checkImage = (image: CatalogImage) => {
      if (!/^https:\/\/images\.unsplash\.com\/photo-[\w-]+(\?.*)?$/.test(image.src)) {
        report(`image ${image.src} isn't on images.unsplash.com`);
      }
      if (!image.alt.trim()) report(`image ${image.src} has no alt text`);
    };
    const checkHref = (href: string) => {
      if (!isKnownRoute(href, known)) report(`link ${href} doesn't match a page`);
    };
    const checkAction = (action: Action | undefined) => action && checkHref(action.href);
    const checkProduct = (slug: string) => {
      const audience = known.productAudiences.get(slug);
      if (!audience) return report(`unknown product ${slug}`);
      if (page.audience && audience !== page.audience && audience !== "unisex") {
        report(`product ${slug} is for ${audience}, not ${page.audience}`);
      }
    };

    if (page.image) checkImage(page.image);
    for (const block of page.blocks) {
      switch (block.type) {
        case "hero":
          checkImage(block.image);
          checkAction(block.action);
          break;
        case "categoryTiles":
          for (const tile of block.tiles) {
            checkHref(tile.href);
            checkProduct(tile.productSlug);
            const category = categoryOf(tile.href, known);
            if (page.audience && category && !known.audienceCategories[page.audience].has(category)) {
              report(`tile ${tile.href} shows a category with no ${page.audience} products`);
            }
          }
          break;
        case "productRow":
          block.productSlugs.forEach(checkProduct);
          checkAction(block.action);
          break;
        case "story":
          checkImage(block.image);
          checkAction(block.action);
          break;
        case "text":
          checkAction(block.action);
          break;
        case "image":
          checkImage(block.image);
          break;
        case "quote":
          break;
        default:
          block satisfies never;
      }
    }
  }
  return problems;
}

const collectionSlugs: readonly string[] = RESERVED_COLLECTION_SLUGS;

/**
 * Matches the app's routes: /, /stories[/<story>], /products/<product>, /collections/…
 * Links must be bare paths: a query, hash or trailing slash is reported. Collection links are
 * checked for existence, not for having products (an empty tab shows the empty state).
 */
function isKnownRoute(href: string, known: KnownContent): boolean {
  if (["/", "/stories"].includes(href)) return true;
  const [, section, first, second, ...rest] = href.split("/");
  if (!href.startsWith("/") || rest.length > 0) return false;
  if (section === "stories") return second === undefined && known.storySlugs.has(first);
  if (section === "products") return second === undefined && known.productAudiences.has(first);
  if (section !== "collections" || first === undefined) return false;
  if (collectionSlugs.includes(first)) return second === undefined || known.categories.has(second);
  return second === undefined && known.categories.has(first);
}

/** The category a collection link narrows to, if any. */
function categoryOf(href: string, known: KnownContent): string | undefined {
  const [, section, first, second] = href.split("/");
  if (section !== "collections") return undefined;
  const category = second ?? first;
  return known.categories.has(category) ? category : undefined;
}
