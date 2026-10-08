"use client";

import { useSyncExternalStore } from "react";

import { addToBag, EMPTY_BAG, parseBagState, removeSaved, toggleSaved, type BagState } from "./rules";

// Browser-only bag and saved items until the cart has a backend. Persisted to localStorage
// and synced across tabs; the server always renders the empty state.

const STORAGE_KEY = "orra:bag:v1";
const listeners = new Set<() => void>();
let state: BagState = EMPTY_BAG;
let loaded = false;

function read(): BagState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseBagState(JSON.parse(raw)) : EMPTY_BAG;
  } catch {
    return EMPTY_BAG; // storage blocked or corrupt
  }
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  state = read();
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    state = read();
    listeners.forEach((listener) => listener());
  });
}

function commit(next: BagState) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode / quota: keep the in-memory state for this tab.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  ensureLoaded();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  ensureLoaded();
  return state;
}

const getServerSnapshot = () => EMPTY_BAG;

export function useBag(): BagState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export const bagActions = {
  /** Returns false when every unit in stock is already in the bag. */
  add(slug: string, stock: number): boolean {
    ensureLoaded();
    const result = addToBag(state, slug, stock);
    if (result.added) commit(result.state);
    return result.added;
  },
  toggleSaved(slug: string) {
    ensureLoaded();
    commit(toggleSaved(state, slug));
  },
  /** Drops saved slugs that now live in the account (SavedSync, after a merge). */
  removeSaved(slugs: readonly string[]) {
    ensureLoaded();
    const next = removeSaved(state, slugs);
    if (next !== state) commit(next);
  },
};
