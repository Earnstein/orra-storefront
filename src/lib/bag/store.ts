"use client";

import { useSyncExternalStore } from "react";

import { addSaved, EMPTY_BAG, parseBagState, removeSaved, toggleSaved, withoutLines, type BagState } from "./rules";

// What this browser keeps in localStorage (synced across tabs; the server renders the empty
// state): saved items while signed out, and bag lines from before M5 until BagImport moves them
// to the server. The bag itself lives on the server (useBag in use-bag.ts).

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

export function useBrowserBag(): BagState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export const bagActions = {
  /** The old bag lines, for BagImport; `clearLines` drops them once the server has them. */
  lines() {
    ensureLoaded();
    return state.lines;
  },
  clearLines() {
    ensureLoaded();
    const next = withoutLines(state);
    if (next !== state) commit(next);
  },
  /** Move to saved items, signed out. */
  addSaved(slug: string) {
    ensureLoaded();
    const next = addSaved(state, slug);
    if (next !== state) commit(next);
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
