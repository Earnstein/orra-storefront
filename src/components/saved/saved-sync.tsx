"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { isAuthPage } from "@/lib/auth/return-to";
import { bagActions, useBag } from "@/lib/bag/store";
import { mergeSaved } from "@/lib/saved/actions";
import { isSlug, mergeBatch } from "@/lib/saved/limits";
import { savedQueryKey } from "@/lib/saved/use-saved";

// Users merged (or being merged) on this page load: a merge runs once per user per load.
const merged = new Set<string>();
// A failed merge is tried again this many times, this far apart, then on the next page load.
const RETRIES = 2;
const RETRY_MS = 2_000;

/**
 * Moves items saved in this browser into the account when a session appears (sign-in, sign-up, or
 * another tab signing in). It sends `mergeBatch` (the newest 200 valid slugs), then removes from the
 * browser what the account took (and entries that can never merge: malformed or unknown ones),
 * keeping the items that didn't fit and any beyond the batch for a later sync. Idempotent, so two
 * tabs merging at once can't duplicate anything. Signing out never copies the account's items
 * back into the browser. It waits until the visitor has left /sign-in and /sign-up, which navigate
 * away (a full load) as soon as the session appears and would cancel the request. Renders
 * nothing; mounted once in the providers.
 */
export function SavedSync() {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;
  const local = useBag().saved;
  const leaving = isAuthPage(usePathname());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId || leaving || local.length === 0 || merged.has(userId)) return;
    merged.add(userId);
    const batch = mergeBatch(local);
    const retry = () => {
      merged.delete(userId);
      if (attempt < RETRIES) window.setTimeout(() => setAttempt((count) => count + 1), RETRY_MS);
    };
    void mergeSaved(batch)
      .then((result) => {
        if (!result.ok) return retry();
        const inBatch = new Set(batch);
        const keep = new Set([...result.data.unmerged, ...local.filter((slug) => isSlug(slug) && !inBatch.has(slug))]);
        bagActions.removeSaved(local.filter((slug) => !keep.has(slug)));
        queryClient.setQueryData(savedQueryKey(userId), result.data.slugs);
      })
      .catch(retry);
  }, [userId, leaving, local, queryClient, attempt]);

  return null;
}
