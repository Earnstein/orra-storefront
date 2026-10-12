"use client";

import { useSyncExternalStore } from "react";

import { parseBagCount } from "./bag-count";

const listeners = new Set<() => void>();

/** Re-reads the count cookie everywhere (after this tab's own bag changes). */
export function notifyBagCount() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab or device may have changed the bag; the cookie is current again when we're back.
  document.addEventListener("visibilitychange", listener);
  return () => {
    listeners.delete(listener);
    document.removeEventListener("visibilitychange", listener);
  };
}

/** The bag's item count, from the cookie (0 on the server and before hydration). */
export function useBagCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => parseBagCount(document.cookie),
    () => 0,
  );
}
