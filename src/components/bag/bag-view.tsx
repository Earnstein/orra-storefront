"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { BagLine as Line } from "@/lib/bag/types";
import { useBag } from "@/lib/bag/use-bag";
import { formatPrice } from "@/lib/format";
import { useSaved } from "@/lib/saved/use-saved";
import { BagLine } from "./bag-line";
import { EmptyBag } from "./empty-bag";
import { CheckoutButton, OrderSummary } from "./order-summary";

/** A removed line, kept in its place with Undo until the shopper leaves or undoes it. */
type Removed = { slug: string; name: string; quantity: number; index: number };

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
  const undoRefs = useRef(new Map<string, HTMLButtonElement>());
  const quantityRefs = useRef(new Map<string, HTMLSelectElement>());
  const [focusUndo, setFocusUndo] = useState<string | null>(null);
  const [focusQuantity, setFocusQuantity] = useState<string | null>(null);

  // Focus follows the shopper's action: to Undo after a remove, back to the line after an undo.
  useEffect(() => {
    if (focusUndo) undoRefs.current.get(focusUndo)?.focus();
  }, [focusUndo, removed, bag.bag]);
  useEffect(() => {
    if (!focusQuantity) return;
    const select = quantityRefs.current.get(focusQuantity);
    if (select) {
      select.focus();
      setFocusQuantity(null);
    }
  }, [focusQuantity, bag.bag]);

  async function run(action: () => Promise<unknown>, done: string) {
    setError(null);
    try {
      await action();
      setAnnouncement(done);
    } catch (failure) {
      const message = failure instanceof Error && failure.message ? failure.message : "Something went wrong. Try again.";
      setError(message);
    }
  }

  function remove(line: Line, index: number) {
    setRemoved((current) => [...current.filter((r) => r.slug !== line.slug), { slug: line.slug, name: line.name, quantity: line.quantity, index }]);
    setFocusUndo(line.slug);
    void run(() => bag.remove(line.slug), `${line.name} removed from your bag.`);
  }

  function undo(entry: Removed) {
    setRemoved((current) => current.filter((r) => r.slug !== entry.slug));
    setFocusUndo(null);
    setFocusQuantity(entry.slug);
    void run(() => bag.add(entry.slug, entry.quantity), `${entry.name} is back in your bag.`);
  }

  if (bag.status === "failed") {
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
  const visible = removed.filter((entry) => !current.lines.some((line) => line.slug === entry.slug));
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
                  onQuantity={(quantity) => void run(() => bag.setQuantity(row.line.slug, quantity), `${row.line.name}: ${quantity} in your bag.`)}
                  onRemove={() => remove(row.line, index)}
                  onMove={() => void run(() => bag.moveToSaved(row.line.slug), `${row.line.name} moved to your saved items.`)}
                />
              ) : (
                <li key={`removed-${row.entry.slug}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border py-block text-body">
                  <span>{row.entry.name} removed.</span>
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="px-0"
                    ref={(element) => {
                      if (element) undoRefs.current.set(row.entry.slug, element);
                      else undoRefs.current.delete(row.entry.slug);
                    }}
                    onClick={() => undo(row.entry)}
                  >
                    Undo
                  </Button>
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
