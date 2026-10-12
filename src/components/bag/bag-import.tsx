"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { bagQueryKey } from "@/lib/bag/bag-query";
import { postBag } from "@/lib/bag/client";
import { BAG_LINE_LIMIT, MAX_QUANTITY } from "@/lib/bag/limits";
import { bagActions } from "@/lib/bag/store";
import { isSlug } from "@/lib/saved/limits";
import { notifyBagCount } from "@/lib/bag/use-bag-count";

let started = false;

/**
 * Moves a bag kept in this browser before the bag lived on the server (`orra:bag:v1` lines) to
 * the server, once: on the first page load that finds lines, then drops them from local storage
 * (saved items stay). Does nothing when there are none, which is almost always. Mounted once.
 */
export function BagImport() {
  const queryClient = useQueryClient();
  // Same mutation scope as useBag's changes: a guest has no cart cookie until the first write
  // answers, so an Add to bag sent meanwhile would create a second guest cart and one of the two
  // would be lost. In one scope, the add waits for the import (and its cookie).
  const { mutateAsync: importLines } = useMutation({ mutationKey: ["bag"], scope: { id: "bag" }, mutationFn: postBag });
  useEffect(() => {
    const lines = bagActions.lines();
    if (started || lines.length === 0) return;
    started = true;
    // Old data may hold slugs that no longer validate; one bad line mustn't refuse the rest.
    const batch = lines
      .filter((line) => isSlug(line.slug))
      .slice(0, BAG_LINE_LIMIT)
      .map((line) => ({ slug: line.slug, quantity: Math.min(line.quantity, MAX_QUANTITY) }));
    if (batch.length === 0) return bagActions.clearLines();
    // Two tabs restored at once may both import; the server keeps the larger quantity, so nothing doubles.
    void importLines({ kind: "import", lines: batch })
      .then((result) => {
        // Invalid input (old data that no longer validates) can't succeed later either.
        if (!result.ok && result.error === "failed") return void (started = false);
        bagActions.clearLines();
        if (result.ok) queryClient.setQueryData(bagQueryKey, result.data.bag);
        notifyBagCount();
      })
      .catch(() => {
        started = false;
      });
  }, [queryClient, importLines]);
  return null;
}
