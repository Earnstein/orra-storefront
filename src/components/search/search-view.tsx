"use client";

import { useDebouncer } from "@tanstack/react-pacer";
import Form from "next/form";
import { useQueryStates } from "nuqs";
import { useEffect, useState } from "react";

import { ResultsView } from "@/components/listing/results-view";
import { Container } from "@/components/primitives";
import { activeFilterCount, type ResultsScope } from "@/lib/catalog/filters";
import { resultsParsers, toResultsQuery } from "@/lib/catalog/search-params";
import { PopularSearches } from "./search-links";

// ResultsView takes the search text from the URL; only the kind matters here.
const SEARCH_SCOPE: ResultsScope = { kind: "search", q: "" };

/**
 * The /search page: a large field, then "Results for ‘q’" with the listing toolbar, filters, grid
 * and Load more, or the popular searches when there's no query. Typing replaces `q` in the URL
 * 300 ms after the last keystroke (Enter applies it at once); without JavaScript the field
 * submits a GET to /search. When `q` changes from elsewhere (Back, a search from the header),
 * the field takes the new value and drops any write still pending.
 */
export function SearchView() {
  const [params, setParams] = useQueryStates(resultsParsers);
  const query = params.q.trim();
  const [text, setText] = useState(query);

  const write = (next: string) => void setParams({ q: next || null, page: null }, { history: "replace", scroll: false });
  const writer = useDebouncer(write, { wait: 300 });

  // The URL's query moved without this field (Back, a search from the header): show it.
  const [shown, setShown] = useState(query);
  if (query !== shown) {
    setShown(query);
    if (query !== text.trim()) setText(query);
  }
  // Nothing left to write once the field and the URL agree.
  useEffect(() => {
    if (query === text.trim()) writer.cancel();
  }, [query, text, writer]);

  // With filters on, the way out of no results is Clear all filters (shown by ResultsView), so
  // popular searches only follow a search that finds nothing at all.
  const filtered = activeFilterCount(toResultsQuery(params, SEARCH_SCOPE).filters) > 0;

  return (
    <>
      <Container className="flex flex-col gap-block py-block">
        <Form
          action="/search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            writer.cancel();
            if (text.trim() !== query) write(text.trim());
          }}
        >
          <input
            type="search"
            name="q"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              writer.maybeExecute(event.target.value.trim());
            }}
            aria-label="Search for"
            placeholder="Search for: bags"
            autoComplete="off"
            enterKeyHint="search"
            className="w-full border-b border-border-strong bg-transparent py-2 text-headline outline-none placeholder:text-muted-foreground focus-visible:border-foreground [&::-webkit-search-cancel-button]:hidden"
          />
        </Form>
        {query ? <h1 className="text-title">Results for ‘{query}’</h1> : <h1 className="sr-only">Search</h1>}
      </Container>

      {query ? (
        <ResultsView
          scope={SEARCH_SCOPE}
          empty={
            <div className="flex flex-col gap-block">
              <p className="text-title">No results for ‘{query}’</p>
              {!filtered && <PopularSearches />}
            </div>
          }
        />
      ) : (
        <Container className="pb-section">
          <PopularSearches />
        </Container>
      )}
    </>
  );
}
