"use client";

import Form from "next/form";
import Link from "next/link";
import { SearchIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Container } from "@/components/primitives";
import { ProductCard } from "@/components/product/product-card";
import { Button } from "@/components/ui/button";
import { SheetClose, SheetTitle } from "@/components/ui/sheet";
import { stories } from "@/content/stories";
import { cn } from "@/lib/utils";
import { LinkGroup, PopularSearches, searchPath } from "./search-links";
import { MIN_SUGGEST_LENGTH, useSuggestions, type TermSuggestions } from "./use-suggestions";

const resultsLabel = (total: number) => (total === 1 ? "1 result" : `${total} results`);

/**
 * The search panel's contents: the field, then popular searches and links before typing, and
 * products, categories and "See all" while typing. Enter submits to /search (it works without
 * JavaScript too). Following any link or submitting calls `onDone`, so the panel closes.
 */
export function SearchPanel({ inputRef, onDone }: { inputRef: React.Ref<HTMLInputElement>; onDone: () => void }) {
  const [q, setQ] = useState("");
  const { data, isPlaceholderData, isError } = useSuggestions(q);
  const typing = q.trim().length >= MIN_SUGGEST_LENGTH;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onClick={(event) => {
        // A plain click on a link navigates here; a modified one opens elsewhere, so stay open.
        const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
        if (!modified && (event.target as HTMLElement).closest("a")) onDone();
      }}
    >
      <SheetTitle className="sr-only">Search</SheetTitle>
      <Container className="flex h-header shrink-0 items-center gap-4 border-b">
        <Form action="/search" role="search" className="flex flex-1 items-center gap-3" onSubmit={onDone}>
          <SearchIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            name="q"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            aria-label="Search for"
            placeholder="Search for: bags"
            autoComplete="off"
            enterKeyHint="search"
            className="w-full border-b border-border-strong bg-transparent py-1.5 text-body outline-none placeholder:text-muted-foreground focus-visible:border-foreground [&::-webkit-search-cancel-button]:hidden"
          />
        </Form>
        <SheetClose render={<Button variant="ghost" size="icon" className="-mr-2.5" />}>
          <XIcon />
          <span className="sr-only">Close</span>
        </SheetClose>
      </Container>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Container className="py-block">
          {!typing ? (
            <StartLinks />
          ) : !data ? (
            <p className="caption text-muted-foreground">{isError ? "Couldn’t load suggestions. Press Enter to search." : "Searching…"}</p>
          ) : data.total === 0 ? (
            <div className={cn("flex flex-col gap-block", isPlaceholderData && "opacity-60")}>
              <p className="text-title">No results for ‘{data.term}’</p>
              <PopularSearches />
            </div>
          ) : (
            <Matches suggestions={data} dimmed={isPlaceholderData} />
          )}
        </Container>
      </div>
      <p role="status" className="sr-only">
        {typing && data ? resultsLabel(data.total) : ""}
      </p>
    </div>
  );
}

/** Before typing: popular searches, new arrivals by audience, and the stories. */
function StartLinks() {
  return (
    <div className="grid gap-block md:grid-cols-3">
      <PopularSearches />
      <LinkGroup title="New in">
        <p className="flex items-center gap-3 text-title">
          <Link href="/collections/women?new=1" className="link-quiet">
            Women
          </Link>
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
          <Link href="/collections/men?new=1" className="link-quiet">
            Men
          </Link>
        </p>
      </LinkGroup>
      <LinkGroup title="Stories">
        <ul className="flex flex-col gap-2">
          {stories.map((story) => (
            <li key={story.slug}>
              <Link href={`/stories/${story.slug}`} className="link-quiet">
                {story.title}
              </Link>
            </li>
          ))}
        </ul>
      </LinkGroup>
    </div>
  );
}

/** While typing: matching categories and "See all", then up to six products. */
function Matches({ suggestions, dimmed }: { suggestions: TermSuggestions; dimmed: boolean }) {
  const { term } = suggestions;
  return (
    <div
      aria-busy={dimmed}
      className={cn("grid gap-block transition-opacity duration-200 md:grid-cols-[1fr_3fr]", dimmed && "opacity-60")}
    >
      <div className="flex flex-col gap-block">
        {suggestions.categories.length > 0 && (
          <LinkGroup title="Categories">
            <ul className="flex flex-col gap-2">
              {suggestions.categories.map((category) => (
                <li key={category.slug}>
                  <Link href={searchPath(term, category.slug)} className="link-quiet">
                    {category.name} <span className="text-muted-foreground">({category.count})</span>
                  </Link>
                </li>
              ))}
            </ul>
          </LinkGroup>
        )}
        <Link href={searchPath(term)} className="eyebrow link">
          See all {resultsLabel(suggestions.total)} →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-x-tile gap-y-block md:grid-cols-3">
        {suggestions.products.map((product) => (
          <ProductCard key={product.slug} product={product} sizes="(min-width: 768px) 22vw, 50vw" />
        ))}
      </div>
    </div>
  );
}
