// Pure bag/saved-items rules. No storage or React here, so they're easy to test and to
// move server-side when the cart gets a backend.

import { SAVED_LIMIT } from "@/lib/saved/limits";

export type BagLine = { slug: string; quantity: number };
export type BagState = { lines: BagLine[]; saved: string[] };

export const EMPTY_BAG: BagState = { lines: [], saved: [] };

export function quantityInBag(state: BagState, slug: string): number {
  return state.lines.find((line) => line.slug === slug)?.quantity ?? 0;
}

export function bagCount(state: BagState): number {
  return state.lines.reduce((total, line) => total + line.quantity, 0);
}

/** Adds one unit, never exceeding the units in stock. `added` is false when capped. */
export function addToBag(state: BagState, slug: string, stock: number): { state: BagState; added: boolean } {
  const current = quantityInBag(state, slug);
  if (current >= stock) return { state, added: false };
  const lines = current
    ? state.lines.map((line) => (line.slug === slug ? { ...line, quantity: line.quantity + 1 } : line))
    : [...state.lines, { slug, quantity: 1 }];
  return { state: { ...state, lines }, added: true };
}

export function isSaved(state: BagState, slug: string): boolean {
  return state.saved.includes(slug);
}

/** Saves or unsaves `slug`. The browser keeps at most SAVED_LIMIT (the account's cap), dropping the oldest. */
export function toggleSaved(state: BagState, slug: string): BagState {
  const saved = isSaved(state, slug) ? state.saved.filter((s) => s !== slug) : [...state.saved, slug].slice(-SAVED_LIMIT);
  return { ...state, saved };
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
