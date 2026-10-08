"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { ActionResult } from "@/lib/account/actions";
import { authClient } from "@/lib/auth-client";
import { isSaved as isSavedLocally } from "@/lib/bag/rules";
import { bagActions, useBag } from "@/lib/bag/store";
import { saveItem, unsaveItem } from "@/lib/saved/actions";
import { SAVED_LIMIT } from "@/lib/saved/limits";

export type SavedStatus = "local" | "loading" | "account";

export const savedQueryKey = (userId: string) => ["saved", userId] as const;

const SIGNED_OUT = "signed-out";

async function fetchSaved(): Promise<string[]> {
  const response = await fetch("/api/saved", { cache: "no-store" });
  if (response.status === 401) throw new Error(SIGNED_OUT);
  if (!response.ok) throw new Error(`saved: ${response.status}`);
  return ((await response.json()) as { slugs: string[] }).slugs;
}

/**
 * The server said "signed out" while the browser still thinks it's signed in (a session revoked
 * elsewhere, within the 5-minute cookie cache). Re-read the session without the cache, which also
 * clears the stale cookies, then tell the session store, so saving goes back to this browser.
 */
async function recheckSession() {
  await authClient.getSession({ query: { disableCookieCache: true } }).catch(() => undefined);
  authClient.$store.notify("$sessionSignal");
}

async function unwrap(result: Promise<ActionResult<{ slugs: string[] }>>): Promise<string[]> {
  const outcome = await result;
  if (!outcome.ok) throw new Error(outcome.error === "signed-out" ? SIGNED_OUT : outcome.message);
  return outcome.data.slugs;
}

/**
 * The one hook for saved items (product pages, /saved, the account page).
 * - Signed out (or while the session loads): this browser's list, as before accounts.
 * - `status` is "loading" while the session or the account's list loads, so a page that lists
 *   items (/saved) can show a placeholder instead of the wrong list.
 * - Signed in: the account's list (`/api/saved`). A toggle changes it at once, then the server
 *   action confirms it; a failure rolls back. Toggles run one at a time in click order (one
 *   mutation scope), and the list is re-read only after the last one settles, so rapid clicks end
 *   on the server in the state shown. While the account's list loads, buttons show the browser's
 *   list and stay usable.
 */
export function useSaved() {
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const userId = session?.user.id;
  const bag = useBag();

  const account = useQuery({
    queryKey: savedQueryKey(userId ?? ""),
    queryFn: fetchSaved,
    enabled: Boolean(userId),
    retry: (failures, failure) => failure.message !== SIGNED_OUT && failures < 2,
  });
  const listSignedOut = account.error?.message === SIGNED_OUT;
  useEffect(() => {
    if (listSignedOut) void recheckSession();
  }, [listSignedOut]);

  const toggleMutation = useMutation({
    mutationKey: ["saved"],
    scope: { id: "saved" },
    mutationFn: ({ slug, save }: { slug: string; save: boolean }) => unwrap(save ? saveItem(slug) : unsaveItem(slug)),
    onMutate: async ({ slug, save }) => {
      const key = savedQueryKey(userId!);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<string[]>(key);
      if (previous) {
        queryClient.setQueryData<string[]>(key, save ? [slug, ...previous.filter((s) => s !== slug)] : previous.filter((s) => s !== slug));
      }
      return { previous, key };
    },
    onError: (failure, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous);
      if (failure.message === SIGNED_OUT) void recheckSession();
    },
    onSettled: (_data, _error, _variables, context) => {
      // Only once the last queued toggle has settled, so an earlier answer can't undo a later click.
      if (context && queryClient.isMutating({ mutationKey: ["saved"] }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: context.key });
      }
    },
  });

  // "loading" until it's known whose list this is (the session, then the account's list); toggles
  // meanwhile still work (signed-out ones go to this browser).
  const status: SavedStatus = userId ? (account.isSuccess ? "account" : "loading") : sessionPending ? "loading" : "local";
  // Newest first either way (the browser's list is stored oldest first), and never over the cap.
  const slugs = status === "account" ? account.data! : [...bag.saved].reverse().slice(0, SAVED_LIMIT);

  return {
    slugs,
    status,
    /** The account's list couldn't be loaded (not because the session ended). */
    failed: account.isError && !listSignedOut,
    retry: () => void account.refetch(),
    isSaved: (slug: string) => (status === "account" ? slugs.includes(slug) : isSavedLocally(bag, slug)),
    toggle: (slug: string) => {
      if (!userId) return bagActions.toggleSaved(slug);
      const shown = status === "account" ? slugs.includes(slug) : isSavedLocally(bag, slug);
      toggleMutation.mutate({ slug, save: !shown });
    },
  };
}
