import { useQuery, type QueryClient } from "@tanstack/react-query";

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

/**
 * The session as every page reads it in the browser (pages stay static). One TanStack query instead
 * of Better Auth's client, which only the sign-in and account forms need and load on their own pages:
 * keeping it out of every page saves its weight before the page's main image. Re-read when the tab
 * regains focus (another tab may have signed in or out).
 */
export function useBrowserSession() {
  const query = useQuery({ queryKey: sessionQueryKey, queryFn: () => fetchSessionUser(), staleTime: 5_000, retry: 1 });
  return { user: query.data ?? null, isPending: query.isPending };
}

/** Re-reads the session without the cookie cache and updates every reader. */
export async function recheckSession(queryClient: QueryClient) {
  const user = await fetchSessionUser({ uncached: true }).catch(() => undefined);
  if (user !== undefined) queryClient.setQueryData(sessionQueryKey, user);
  return user;
}
