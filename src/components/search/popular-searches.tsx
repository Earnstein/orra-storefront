import Link from "next/link";

import { POPULAR_SEARCHES } from "@/content/search";

/** The /search URL for some text, optionally narrowed to a category. */
export const searchPath = (q: string, category?: string) =>
  `/search?${new URLSearchParams(category ? { q, category } : { q })}`;

/** A titled group of links (search panel, /search). */
export function LinkGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="eyebrow text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** The popular search terms, each linking to its results. */
export function PopularSearches() {
  return (
    <LinkGroup title="Popular searches">
      <ul className="flex flex-col gap-2">
        {POPULAR_SEARCHES.map((term) => (
          <li key={term}>
            <Link href={searchPath(term)} className="text-title link-quiet">
              {term}
            </Link>
          </li>
        ))}
      </ul>
    </LinkGroup>
  );
}

