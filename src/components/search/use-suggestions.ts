import { useDebouncedValue } from "@tanstack/react-pacer";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { Suggestions } from "@/lib/catalog/suggest";

/** Suggestions start at this many characters. */
export const MIN_SUGGEST_LENGTH = 2;

/** Suggestions with the text they're for, so stale ones are never shown against newer text. */
export type TermSuggestions = Suggestions & { term: string };

async function fetchSuggestions(term: string, signal: AbortSignal): Promise<TermSuggestions> {
  const response = await fetch(`/api/search/suggest?${new URLSearchParams({ q: term })}`, { signal });
  if (!response.ok) throw new Error(`Suggestions request failed: ${response.status}`);
  return { ...((await response.json()) as Suggestions), term };
}

/**
 * Suggestions for what's being typed: 200 ms after the last keystroke, from MIN_SUGGEST_LENGTH
 * characters. The previous suggestions stay (dimmed by the caller) while the next load, and a
 * superseded request is aborted. `data.term` is the text the shown suggestions are for.
 */
export function useSuggestions(q: string) {
  const [term] = useDebouncedValue(q.trim(), { wait: 200 });
  const { data, isPlaceholderData, isError } = useQuery({
    queryKey: ["suggest", term],
    queryFn: ({ signal }) => fetchSuggestions(term, signal),
    enabled: term.length >= MIN_SUGGEST_LENGTH,
    placeholderData: keepPreviousData,
  });
  return { data, isPlaceholderData, isError };
}
