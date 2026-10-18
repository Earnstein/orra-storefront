"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isBuyable, type BagLine as Line } from "@/lib/bag/types";
import { useBag } from "@/lib/bag/use-bag";
import { formatPrice } from "@/lib/format";
import { useSaved } from "@/lib/saved/use-saved";
import { BagLine } from "./bag-line";
import { EmptyBag } from "./empty-bag";
import { CheckoutButton, OrderSummary } from "./order-summary";

/**
 * A removed line, kept in its place with Undo until the shopper leaves or undoes it. `state`:
 * "removing" while the remove is on its way, "removed" once done, "restoring" while Undo's add is
 * on its way, "sold-out" when Undo found none left.
 */
type Removed = { slug: string; name: string; quantity: number; index: number; state: "removing" | "removed" | "restoring" | "sold-out" };

/**
 * /bag, after Gucci's shopping bag in Orra's tokens: "Shopping bag (n)", the lines (two-thirds of
 * the width from lg) and the order summary beside them. Remove is immediate and leaves an Undo in
 * the line's place (instead of a confirmation dialog); changes are optimistic (useBag).
 */
export function BagView() {
  const bag = useBag();
  const saved = useSaved();
  const [removed, setRemoved] = useState<Removed[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const undoRefs = useRef(new Map<string, HTMLElement>());
  const quantityRefs = useRef(new Map<string, HTMLButtonElement>());
  const [focusUndo, setFocusUndo] = useState<string | null>(null);
  const [focusQuantity, setFocusQuantity] = useState<string | null>(null);

  // Focus follows the shopper's action: to Undo after a remove, back to the line after an undo.
  // Each moves focus once, as soon as its target is on screen.
  useEffect(() => {
    if (!focusUndo) return;
    const target = undoRefs.current.get(focusUndo);
    if (target) {
      target.focus();
      setFocusUndo(null);
    }
  }, [focusUndo, removed, bag.bag]);
  useEffect(() => {
    if (!focusQuantity) return;
    const select = quantityRefs.current.get(focusQuantity);
    if (select) {
      select.focus();
      setFocusQuantity(null);
    }
  }, [focusQuantity, bag.bag]);

  /** Runs a change; the latest outcome decides whether an error shows. Undefined when it failed. */
  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    setError(null);
    try {
      const result = await action();
      setError(null);
      return result;
    } catch (failure) {
      const message = failure instanceof Error && failure.message ? failure.message : "Something went wrong. Try again.";
      setError(message);
      return undefined;
    }
  }

  const dropRemoved = (slug: string) => setRemoved((current) => current.filter((r) => r.slug !== slug));
  const updateRemoved = (slug: string, change: Partial<Removed>) =>
    setRemoved((current) => current.map((r) => (r.slug === slug ? { ...r, ...change } : r)));

  async function announceAfter(action: () => Promise<unknown>, done: string) {
    if ((await run(action)) !== undefined) setAnnouncement(done);
  }

  function setUndoRef(slug: string, element: HTMLElement | null) {
    if (element) undoRefs.current.set(slug, element);
    else undoRefs.current.delete(slug);
  }

  async function remove(line: Line, index: number) {
    setRemoved((current) => [...current.filter((r) => r.slug !== line.slug), { slug: line.slug, name: line.name, quantity: line.quantity, index, state: "removing" }]);
    setFocusUndo(line.slug);
    if (await run(() => bag.remove(line.slug))) {
      updateRemoved(line.slug, { state: "removed" });
      setAnnouncement(`${line.name} removed from your bag.`);
    } else {
      // The line is back (rolled back): drop its Undo and return focus to it.
      dropRemoved(line.slug);
      setFocusUndo(null);
      setFocusQuantity(line.slug);
    }
  }

  async function undo(entry: Removed) {
    if (entry.state !== "removed") return;
    // The entry (and focus on its Undo) stays until the server answers.
    updateRemoved(entry.slug, { state: "restoring" });
    const result = await run(() => bag.add(entry.slug, entry.quantity));
    if (!result) {
      updateRemoved(entry.slug, { state: "removed" });
      return;
    }
    const line = result.bag.lines.find((l) => l.slug === entry.slug);
    if (!line || !isBuyable(line)) {
      updateRemoved(entry.slug, { state: "sold-out" });
      setFocusUndo(entry.slug);
      setAnnouncement(`${entry.name} is sold out.`);
      return;
    }
    dropRemoved(entry.slug);
    setFocusQuantity(entry.slug);
    setAnnouncement(
      line.quantity < entry.quantity ? `${entry.name} is back in your bag — only ${line.quantity} left.` : `${entry.name} is back in your bag.`,
    );
  }

  // A failed re-read keeps the bag already on screen.
  if (bag.status === "failed" && !bag.bag) {
    return (
      <div className="flex flex-col items-start gap-4">
        <h1 className="text-title uppercase">Shopping bag</h1>
        <p role="alert" className="text-body">
          We couldn&apos;t load your bag.
        </p>
        <Button type="button" variant="outline" onClick={bag.retry}>
          Try again
        </Button>
      </div>
    );
  }

  if (!bag.bag) {
    return (
      <div className="flex flex-col gap-block" aria-busy>
        <h1 className="text-title uppercase">Shopping bag</h1>
        <div className="grid gap-block lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            {Array.from({ length: 2 }, (_, i) => (
              <Skeleton key={i} className="h-40 bg-surface" />
            ))}
          </div>
          <Skeleton className="h-72 bg-surface" />
        </div>
      </div>
    );
  }

  const current = bag.bag;
  const inBag = (entry: Removed) => current.lines.some((line) => line.slug === entry.slug);
  // A settled entry whose line is back in the bag (added again here or in another tab) is dropped.
  const back = removed.filter((entry) => (entry.state === "removed" || entry.state === "sold-out") && inBag(entry));
  if (back.length > 0) setRemoved(removed.filter((entry) => !back.includes(entry)));
  // Until the optimistic removal lands the line is still in the bag; show it, not its entry.
  const visible = removed.filter((entry) => !inBag(entry));
  // Each removed line keeps its place among the lines that are left.
  const rows: ({ kind: "line"; line: Line } | { kind: "removed"; entry: Removed })[] = current.lines.map((line) => ({ kind: "line", line }));
  for (const entry of [...visible].sort((a, b) => a.index - b.index)) rows.splice(Math.min(entry.index, rows.length), 0, { kind: "removed", entry });

  return (
    <div className="flex flex-col gap-block">
      <div className="flex flex-col gap-4">
        <h1 className="text-title uppercase">Shopping bag ({current.count})</h1>
        {current.count > 0 && <CheckoutButton bag={current} label={`Checkout · ${formatPrice(current.subtotal)}`} className="lg:hidden" />}
      </div>

      {error && (
        <p role="alert" className="text-body text-destructive">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyBag savedCount={saved.status === "loading" ? 0 : saved.slugs.length} />
      ) : (
        <div className="grid items-start gap-block lg:grid-cols-3">
          <ul aria-label="Items in your bag" className="flex flex-col border-b border-border lg:col-span-2">
            {rows.map((row, index) =>
              row.kind === "line" ? (
                <BagLine
                  key={row.line.slug}
                  ref={(element) => {
                    if (element) quantityRefs.current.set(row.line.slug, element);
                    else quantityRefs.current.delete(row.line.slug);
                  }}
                  line={row.line}
                  onQuantity={(quantity) => void announceAfter(() => bag.setQuantity(row.line.slug, quantity), `${row.line.name}: ${quantity} in your bag.`)}
                  onRemove={() => void remove(row.line, index)}
                  onMove={() => void announceAfter(() => bag.moveToSaved(row.line.slug), `${row.line.name} moved to your saved items.`)}
                />
              ) : (
                <li key={`removed-${row.entry.slug}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border py-block text-body">
                  {row.entry.state === "sold-out" ? (
                    // No Undo left to offer; focus lands on the explanation instead of the page.
                    <span tabIndex={-1} ref={(element) => setUndoRef(row.entry.slug, element)} className="outline-none">
                      {row.entry.name} is sold out, so it couldn&apos;t go back in your bag.
                    </span>
                  ) : (
                    <>
                      <span>{row.entry.name} removed.</span>
                      <Button
                        type="button"
                        variant="link"
                        size="xs"
                        className="px-0"
                        ref={(element) => setUndoRef(row.entry.slug, element)}
                        aria-label={`Undo, put ${row.entry.name} back`}
                        aria-disabled={row.entry.state !== "removed" || undefined}
                        onClick={() => void undo(row.entry)}
                      >
                        Undo
                      </Button>
                    </>
                  )}
                </li>
              ),
            )}
          </ul>
          <div className="lg:sticky lg:top-[calc(var(--spacing-header)+1rem)]">
            <OrderSummary bag={current} />
          </div>
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
