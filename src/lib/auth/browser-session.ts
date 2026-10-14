import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";

import { SIGNED_OUT_AT } from "./signed-out-marker";

export type BrowserUser = { id: string; name: string; email: string };

export const sessionQueryKey = ["session"] as const;

/**
 * Who is signed in, read from Better Auth's `/api/auth/get-session` (`null` when signed out).
 * `uncached` skips the 5-minute cookie cache, so a session revoked elsewhere reads as signed out
 * (and its stale cookies are cleared).
 */
export async function fetchSessionUser({ uncached = false } = {}): Promise<BrowserUser | null> {
  const response = await fetch(`/api/auth/get-session${uncached ? "?disableCookieCache=true" : ""}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`session: ${response.status}`);
  const data = (await response.json()) as { user?: BrowserUser } | null;
  return data?.user ? { id: data.user.id, name: data.user.name, email: data.user.email } : null;
}

// Written when this tab changes the user (a rename), so other tabs re-read the session. Signing out
// writes SIGNED_OUT_AT. (Better Auth's client only broadcasts while its own session store is in use.)
const SESSION_CHANGED_AT = "orra:session-changed-at";

/** Tells this browser's other tabs to re-read the session. */
export function announceSessionChange() {
  try {
    localStorage.setItem(SESSION_CHANGED_AT, String(Date.now()));
  } catch {
    // Private mode or blocked storage: other tabs catch up when they regain focus.
  }
}

// Advanced each time another tab changes the session, so a recheck that started earlier knows its
// answer may be older than the read that change started.
let generation = 0;

/** Another tab signed out or renamed: re-read the session, superseding any recheck under way. */
export function sessionChangedElsewhere(queryClient: QueryClient) {
  generation += 1;
  void queryClient.invalidateQueries({ queryKey: sessionQueryKey });
}

/**
 * The session as every page reads it in the browser (pages stay static). One TanStack query instead
 * of Better Auth's client, which only the sign-in and account forms need and load on their own pages:
 * keeping it out of every page saves its weight before the page's main image. Read once per page
 * load (not again for each component that mounts), and again when the tab regains focus or another
 * tab signs out (another tab may have signed in or out).
 */
export function useBrowserSession() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: sessionQueryKey,
    queryFn: () => fetchSessionUser(),
    staleTime: 5_000,
    refetchOnMount: false,
    retry: 1,
  });
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === SESSION_CHANGED_AT || event.key === SIGNED_OUT_AT) sessionChangedElsewhere(queryClient);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [queryClient]);
  // Next hydrates a page in pieces: the header can start this read, and get its answer, before a
  // later piece hydrates. That piece must still render what the server did (loading), or React
  // throws the hydration mismatch away and re-renders it, losing whatever happened meanwhile.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!hydrated) return { user: null, isPending: true };
  return { user: query.data ?? null, isPending: query.isPending };
}

const noopSubscribe = () => () => {};

/**
 * Re-reads the session without the cookie cache and updates every reader (a read already under way,
 * which may have used the stale cookie, is cancelled first). If another tab changed the session
 * meanwhile, the read that started is newer, so this answer is dropped. Resolves to the user, null
 * when signed out, or undefined when the check itself failed (the session is then left as it was).
 */
export async function recheckSession(queryClient: QueryClient) {
  const startedAt = generation;
  const user = await fetchSessionUser({ uncached: true }).catch(() => undefined);
  if (user !== undefined && generation === startedAt) {
    await queryClient.cancelQueries({ queryKey: sessionQueryKey });
    queryClient.setQueryData(sessionQueryKey, user);
  }
  return user;
}
