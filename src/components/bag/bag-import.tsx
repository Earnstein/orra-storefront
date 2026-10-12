"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { importLines } from "@/lib/bag/actions";
import { MAX_QUANTITY, BAG_LINE_LIMIT } from "@/lib/bag/limits";
import { bagActions } from "@/lib/bag/store";
import { bagQueryKey } from "@/lib/bag/use-bag";
import { notifyBagCount } from "@/lib/bag/use-bag-count";

let started = false;

/**
 * Moves a bag kept in this browser before the bag lived on the server (`orra:bag:v1` lines) to
 * the server, once: on the first page load that finds lines, then drops them from local storage
 * (saved items stay). Does nothing when there are none, which is almost always. Mounted once.
 */
export function BagImport() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const lines = bagActions.lines();
    if (started || lines.length === 0) return;
    started = true;
    const batch = lines.slice(0, BAG_LINE_LIMIT).map((line) => ({ slug: line.slug, quantity: Math.min(line.quantity, MAX_QUANTITY) }));
    void importLines(batch)
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
  }, [queryClient]);
  return null;
}
