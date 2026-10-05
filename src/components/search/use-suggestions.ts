import { useDebouncedValue } from "@tanstack/react-pacer";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { Suggestions } from "@/lib/catalog/suggest";

/** Suggestions start at this many characters. */
export const MIN_SUGGEST_LENGTH = 2;

async function fetchSuggestions(q: string, signal: AbortSignal): Promise<Suggestions> {
  const response = await fetch(`/api/search/suggest?${new URLSearchParams({ q })}`, { signal });
  if (!response.ok) throw new Error(`Suggestions request failed: ${response.status}`);
  return response.json();
}

/**
 * Suggestions for what's being typed: 200 ms after the last keystroke, from MIN_SUGGEST_LENGTH
 * characters. The previous suggestions stay while the next load, and a superseded request is
 * aborted. `term` is the text the current suggestions are for.
 */
export function useSuggestions(q: string) {
  const [term] = useDebouncedValue(q.trim(), { wait: 200 });
  const { data, isPlaceholderData } = useQuery({
    queryKey: ["suggest", term],
    queryFn: ({ signal }) => fetchSuggestions(term, signal),
    enabled: term.length >= MIN_SUGGEST_LENGTH,
    placeholderData: keepPreviousData,
  });
  return { data, isPlaceholderData, term };
}
