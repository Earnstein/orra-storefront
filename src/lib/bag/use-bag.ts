"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { addToBag, moveToSaved, removeFromBag, setQuantity, type BagResult } from "./actions";
import { applyChange, type BagChangeRequest } from "./optimistic";
import { bagActions } from "./store";
import type { Bag } from "./types";
import { notifyBagCount } from "./use-bag-count";

export const bagQueryKey = ["bag"] as const;

async function fetchBag(): Promise<Bag> {
  const response = await fetch("/api/bag", { cache: "no-store" });
  if (!response.ok) throw new Error(`bag: ${response.status}`);
  return (await response.json()) as Bag;
}

function send(change: BagChangeRequest): Promise<BagResult> {
  switch (change.kind) {
    case "add":
      return addToBag(change.slug, change.quantity);
    case "set":
      return setQuantity(change.slug, change.quantity);
    case "remove":
      return removeFromBag(change.slug);
    case "move":
      return moveToSaved(change.slug);
  }
}

export type BagChangeResult = { bag: Bag; capped: boolean };

/**
 * The server-side bag. `load: false` (the product page) doesn't read the bag up front — that would
 * cost a request per product view — and learns it from each change's answer instead. Changes are
 * optimistic (except adds, which the server confirms against live stock), rolled back on failure,
 * and run one at a time in click order; the server's answer to the last one becomes the bag.
 */
export function useBag({ load = true }: { load?: boolean } = {}) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: bagQueryKey, queryFn: fetchBag, enabled: load, retry: 1 });

  const mutation = useMutation({
    mutationKey: ["bag"],
    scope: { id: "bag" },
    mutationFn: async (change: BagChangeRequest): Promise<BagChangeResult & { saveLocally?: string }> => {
      const result = await send(change);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: bagQueryKey });
      const previous = queryClient.getQueryData<Bag>(bagQueryKey);
      if (previous) queryClient.setQueryData<Bag>(bagQueryKey, applyChange(previous, change));
      return { previous };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) queryClient.setQueryData(bagQueryKey, context.previous);
    },
    onSuccess: (data) => {
      if (data.saveLocally) bagActions.addSaved(data.saveLocally);
      // An earlier answer mustn't overwrite a later click's optimistic state.
      if (queryClient.isMutating({ mutationKey: ["bag"] }) <= 1) queryClient.setQueryData(bagQueryKey, data.bag);
    },
    onSettled: () => notifyBagCount(),
  });

  return {
    bag: query.data,
    status: query.isSuccess ? ("ready" as const) : query.isError ? ("failed" as const) : ("loading" as const),
    retry: () => void query.refetch(),
    add: (slug: string, quantity = 1) => mutation.mutateAsync({ kind: "add", slug, quantity }),
    setQuantity: (slug: string, quantity: number) => mutation.mutateAsync({ kind: "set", slug, quantity }),
    remove: (slug: string) => mutation.mutateAsync({ kind: "remove", slug }),
    moveToSaved: (slug: string) => mutation.mutateAsync({ kind: "move", slug }),
  };
}
