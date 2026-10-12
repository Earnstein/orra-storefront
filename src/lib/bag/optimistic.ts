import { MAX_QUANTITY } from "./limits";
import type { Bag, BagLine } from "./types";

export type BagChangeRequest =
  | { kind: "add"; slug: string; quantity: number }
  | { kind: "set"; slug: string; quantity: number }
  | { kind: "remove"; slug: string }
  | { kind: "move"; slug: string };

function totals(lines: BagLine[]): Bag {
  const buyable = lines.filter((line) => line.note !== "sold-out");
  return {
    lines,
    count: buyable.reduce((total, line) => total + line.quantity, 0),
    subtotal: buyable.reduce((total, line) => total + line.quantity * line.unitPrice, 0),
    currency: "USD",
  };
}

/**
 * The bag as it will look once `change` succeeds, shown at once while the server confirms. Adds are
 * left alone: the server decides what an add can take (live stock), and the panel shows its answer.
 */
export function applyChange(bag: Bag, change: BagChangeRequest): Bag {
  if (change.kind === "add") return bag;
  if (change.kind === "set") {
    return totals(
      bag.lines.map((line) =>
        line.slug === change.slug && line.note !== "sold-out"
          ? { ...line, quantity: Math.max(1, Math.min(change.quantity, line.stock, MAX_QUANTITY)), note: null }
          : line,
      ),
    );
  }
  return totals(bag.lines.filter((line) => line.slug !== change.slug));
}
