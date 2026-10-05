import type { Audience } from "@/db/schema/catalog";
import { collectionCopy } from "@/lib/content";
import { NEW_ARRIVALS_PAGE_LIMIT } from "./merchandising";
import type { Category } from "./types";

// What each /collections/<slug> address lists. Pure, so the routes, their static params and the
// tests share one definition.

/** Collections that aren't categories. A category with one of these slugs would be unreachable. */
export const RESERVED_COLLECTION_SLUGS = ["new", "women", "men"] as const;

export type CollectionScope =
  | { kind: "new"; limit: number }
  /** That audience plus unisex. */
  | { kind: "audience"; audience: Exclude<Audience, "unisex"> }
  | { kind: "category"; categorySlug: string };

export type Collection = {
  slug: string;
  title: string;
  description?: string;
  scope: CollectionScope;
  /** New, Women and Men narrow by category with tabs (/collections/<slug>/<category>). */
  hasTabs: boolean;
};

export function resolveCollection(slug: string, categories: Category[]): Collection | undefined {
  if (slug === "new") {
    const { title, description } = collectionCopy.new;
    return { slug, title, description, scope: { kind: "new", limit: NEW_ARRIVALS_PAGE_LIMIT }, hasTabs: true };
  }
  if (slug === "women" || slug === "men") {
    const { title, description } = collectionCopy[slug];
    return { slug, title, description, scope: { kind: "audience", audience: slug }, hasTabs: true };
  }
  const category = categories.find((candidate) => candidate.slug === slug);
  if (!category) return undefined;
  return {
    slug,
    title: category.name,
    description: Object.hasOwn(collectionCopy.categories, slug) ? collectionCopy.categories[slug] : undefined,
    scope: { kind: "category", categorySlug: slug },
    hasTabs: false,
  };
}
