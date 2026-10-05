/** Longest search text we act on; anything after it is ignored. */
export const MAX_QUERY_LENGTH = 100;

/**
 * Turns what a shopper typed into a safe Postgres full-text query. Only runs of letters and
 * digits survive, so operators, quotes and SQL are just words or nothing. Words are ANDed and the
 * last one matches as a prefix ("lea" → "lea:*"), so results appear mid-word. `text` is the same
 * words for trigram (typo) matching and ranking; `words` lets each word be matched on its own.
 * Returns undefined when no words remain.
 */
export function buildSearchQuery(q: string): { tsquery: string; text: string; words: string[] } | undefined {
  const words = q.trim().toLowerCase().slice(0, MAX_QUERY_LENGTH).match(/[\p{L}\p{N}]+/gu);
  if (!words) return undefined;
  const last = words.length - 1;
  return {
    tsquery: words.map((word, index) => (index === last ? `${word}:*` : word)).join(" & "),
    text: words.join(" "),
    words,
  };
}
