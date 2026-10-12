// Pure rules for what this browser keeps: saved items while signed out, and (until they're moved
// to the server once) bag lines from before the bag lived on the server. No storage or React here.

import { SAVED_LIMIT } from "@/lib/saved/limits";

export type BagLine = { slug: string; quantity: number };
export type BagState = { lines: BagLine[]; saved: string[] };

export const EMPTY_BAG: BagState = { lines: [], saved: [] };

export function isSaved(state: BagState, slug: string): boolean {
  return state.saved.includes(slug);
}

/** Saves or unsaves `slug`. The browser keeps at most SAVED_LIMIT (the account's cap), dropping the oldest. */
export function toggleSaved(state: BagState, slug: string): BagState {
  const saved = isSaved(state, slug) ? state.saved.filter((s) => s !== slug) : [...state.saved, slug].slice(-SAVED_LIMIT);
  return { ...state, saved };
}

/** Saves `slug` if it isn't saved yet (Move to saved items, signed out), within SAVED_LIMIT. */
export function addSaved(state: BagState, slug: string): BagState {
  return isSaved(state, slug) ? state : toggleSaved(state, slug);
}

/** Drops the bag lines once they've been moved to the server, keeping saved items. */
export function withoutLines(state: BagState): BagState {
  return state.lines.length ? { ...state, lines: [] } : state;
}

/** Removes saved slugs (after they've been merged into an account), keeping the bag lines. */
export function removeSaved(state: BagState, slugs: readonly string[]): BagState {
  const remove = new Set(slugs);
  const saved = state.saved.filter((slug) => !remove.has(slug));
  return saved.length === state.saved.length ? state : { ...state, saved };
}

/** Accepts anything read back from storage and returns a well-formed state. */
export function parseBagState(value: unknown): BagState {
  if (!value || typeof value !== "object") return EMPTY_BAG;
  const raw = value as { lines?: unknown; saved?: unknown };
  const lines = Array.isArray(raw.lines)
    ? raw.lines.filter(
        (line): line is BagLine =>
          !!line && typeof line.slug === "string" && Number.isInteger(line.quantity) && line.quantity > 0,
      )
    : [];
  const saved = Array.isArray(raw.saved) ? raw.saved.filter((s): s is string => typeof s === "string") : [];
  return { lines, saved };
}
